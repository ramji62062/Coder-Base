// ─────────────────────────────────────────────────────────────────────────────
// Real terminal channel — dedicated WebSocket `/ws/terminal`.
//
// This is a SEPARATE transport from the editor/collab (socket.io) and the LSP
// (WebSocket `/ws/lsp`) channels. Raw PTY bytes never cross into the editor's
// message handler, which is what previously corrupted Monaco's rendered state.
//
// Each terminal is a real node-pty wrapping `docker exec -it <container> bash`.
// Both `-i` and `-t` are mandatory: the inner pty inside the container is what
// lets interactive prompts (e.g. `npm create vite`'s "Project name:") receive
// real keystrokes instead of falling back to defaults.
//
// PTY sessions are keyed by `${roomId}:${terminalId}` and live independently of
// any single WebSocket connection. On reconnect we RE-ATTACH to the same pty
// (replaying its scrollback) rather than spawning a duplicate — this kills the
// "terminal gets stuck" / orphaned-process problem and survives network blips.
// ─────────────────────────────────────────────────────────────────────────────

const { spawn: cpSpawn } = require("child_process");
const { join } = require("path");
const { mkdirSync, existsSync, chmodSync } = require("fs");

// Ensure node-pty's spawn-helper binary has execute permissions on macOS
function fixSpawnHelperPermissions() {
  try {
    const candidates = [
      join(process.cwd(), "node_modules", "node-pty", "prebuilds", "darwin-arm64", "spawn-helper"),
      join(process.cwd(), "node_modules", "node-pty", "prebuilds", "darwin-x64", "spawn-helper"),
      join(process.cwd(), "node_modules", "node-pty", "build", "Release", "spawn-helper"),
    ];
    for (const p of candidates) {
      if (existsSync(p)) {
        try { chmodSync(p, 0o755); } catch {}
      }
    }
  } catch {}
}
fixSpawnHelperPermissions();

let pty = null;
try {
  pty = require("node-pty");
  const testPty = pty.spawn(process.platform === "win32" ? "cmd.exe" : "/bin/echo", ["pty-ok"], { cols: 1, rows: 1 });
  testPty.kill();
  console.log("[terminal] node-pty loaded and initialized successfully (real PTY enabled)");
} catch (err) {
  pty = null;
  console.warn("[terminal] node-pty fallback:", err.message);
}
const {
  checkDockerReady,
  ensureRoomContainer,
  destroyRoomContainer,
  syncFilesToWorkspace,
  startWorkspaceWatcher,
  assignDevServerPort,
  getDevServerUrl,
  registerCleanupHook,
  touchActivity,
} = require("./terminal-service");
const { validateTerminalAccess } = require("./terminal-auth");
const { inc, recordError } = require("./metrics");

const MAX_OUTPUT_BUFFER = 512 * 1024;

/** @type {Map<string, PtySession>} `${roomId}:${terminalId}` -> session */
const sessions = new Map();

let activeIoRef = null;
function setActiveIo(io) { activeIoRef = io; }

function sessionKey(roomId, terminalId) {
  return `${roomId}:${terminalId}`;
}

// ─── Unified spawn that works with or without node-pty ───────────────
function spawnShell(command, args, opts) {
  if (pty) {
    // node-pty path (real PTY)
    const child = pty.spawn(command, args, {
      name: "xterm-256color",
      cols: opts.cols || 80,
      rows: opts.rows || 24,
      cwd: opts.cwd,
      env: opts.env || process.env,
    });
    return {
      child,
      onData: (cb) => child.onData(cb),
      onExit: (cb) => child.onExit(cb),
      write: (data) => child.write(data),
      resize: (cols, rows) => { try { child.resize(cols, rows); } catch {} },
      kill: () => { try { child.kill(); } catch {} },
      pid: child.pid,
    };
  }

  // child_process fallback (works even when node-pty native addon is broken)
  const child = cpSpawn(command, args, {
    cwd: opts.cwd,
    env: { ...opts.env, TERM: "xterm-256color", COLORTERM: "truecolor", FORCE_COLOR: "1" },
    stdio: ["pipe", "pipe", "pipe"],
    shell: false,
  });

  const wrapper = {
    child,
    pid: child.pid,
    _dataCb: null,
    _exitCb: null,
    onData(cb) { wrapper._dataCb = cb; },
    onExit(cb) { wrapper._exitCb = cb; },
    write(data) { try { child.stdin.write(data); } catch {} },
    resize() { /* no resize support without PTY */ },
    kill() { try { child.kill("SIGTERM"); } catch {} },
  };

  child.stdout.on("data", (buf) => wrapper._dataCb?.(buf.toString()));
  child.stderr.on("data", (buf) => wrapper._dataCb?.(buf.toString()));
  child.on("exit", (code) => wrapper._exitCb?.({ exitCode: code ?? -1 }));
  child.on("error", (err) => {
    wrapper._dataCb?.(`\r\n\x1b[31mShell error: ${err.message}\x1b[0m\r\n`);
    wrapper._exitCb?.({ exitCode: -1 });
  });

  return wrapper;
}

// ─── Spawn a local shell (no Docker) ─────────────────────────────────
async function spawnLocalPty(roomId, terminalId, cols, rows, files) {
  const key = sessionKey(roomId, terminalId);
  const workspacePath = join(process.cwd(), "temp_workspaces", roomId);
  try { mkdirSync(workspacePath, { recursive: true }); } catch {}
  syncFilesToWorkspace(roomId, files);

  const shell = process.env.SHELL || (process.platform === "win32" ? "powershell.exe" : "/bin/zsh");
  const args = process.platform === "win32" ? [] : ["-l"];

  let wrapper;
  try {
    wrapper = spawnShell(shell, args, {
      cols, rows,
      cwd: workspacePath,
      env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor", FORCE_COLOR: "1" },
    });
  } catch (err) {
    recordError("pty_local_spawn_failed", `${key}: ${err.message}`);
    throw new Error(`Failed to start local shell: ${err.message}`);
  }

  const session = {
    roomId,
    terminalId,
    pty: wrapper,
    cols: cols || 80,
    rows: rows || 24,
    subscribers: new Set(),
    outputBuffer: "",
    alive: true,
    isLocal: true,
    shell,
    workspacePath,
    createdAt: Date.now(),
  };

  wrapper.onData((data) => {
    if (!session.alive) return;
    session.outputBuffer = (session.outputBuffer + data).slice(-MAX_OUTPUT_BUFFER);
    touchActivity(roomId);
    const frame = JSON.stringify({ type: "output", roomId, terminalId, data });
    for (const sub of session.subscribers) {
      if (sub.readyState === sub.OPEN) sub.send(frame);
    }
  });

  wrapper.onExit(({ exitCode }) => {
    session.alive = false;
    const frame = JSON.stringify({ type: "exit", roomId, terminalId, exitCode: exitCode ?? -1 });
    for (const sub of session.subscribers) {
      if (sub.readyState === sub.OPEN) sub.send(frame);
    }
    sessions.delete(key);
    inc("pty_exited");
  });

  sessions.set(key, session);
  inc("pty_spawned");
  console.log(`[terminal] Local shell spawned for room ${roomId} (${shell}, pty=${!!pty})`);
  return session;
}

async function spawnPty(roomId, terminalId, containerId, cols, rows) {
  const key = sessionKey(roomId, terminalId);

  const dockerArgs = pty
    ? ["exec", "-it", containerId, "/bin/bash", "--login"]
    : ["exec", "-i", containerId, "/bin/bash", "--login"];

  let wrapper;
  try {
    wrapper = spawnShell("docker", dockerArgs, {
      cols, rows,
      cwd: process.cwd(),
      env: { ...process.env },
    });
  } catch (err) {
    recordError("pty_spawn_failed", `${key}: ${err.message}`);
    inc("pty_spawn_failed");
    throw new Error(`Failed to start shell: ${err.message}`);
  }

  const session = {
    roomId,
    terminalId,
    pty: wrapper,
    cols: cols || 80,
    rows: rows || 24,
    subscribers: new Set(),
    outputBuffer: "",
    alive: true,
    createdAt: Date.now(),
  };

  wrapper.onData((data) => {
    if (!session.alive) return;
    session.outputBuffer = (session.outputBuffer + data).slice(-MAX_OUTPUT_BUFFER);
    touchActivity(roomId);
    const frame = JSON.stringify({ type: "output", roomId, terminalId, data });
    for (const sub of session.subscribers) {
      if (sub.readyState === sub.OPEN) sub.send(frame);
    }
  });

  wrapper.onExit(({ exitCode }) => {
    session.alive = false;
    const frame = JSON.stringify({ type: "exit", roomId, terminalId, exitCode: exitCode ?? -1 });
    for (const sub of session.subscribers) {
      if (sub.readyState === sub.OPEN) sub.send(frame);
    }
    sessions.delete(key);
    inc("pty_exited");
  });

  sessions.set(key, session);
  inc("pty_spawned");
  return session;
}

function destroySession(roomId, terminalId) {
  const key = sessionKey(roomId, terminalId);
  const session = sessions.get(key);
  if (!session) return;
  try { session.pty.kill(); } catch {}
  session.alive = false;
  sessions.delete(key);
}

// Tear down every pty bound to a room when the room's container is destroyed.
registerCleanupHook((roomId) => {
  for (const [key, session] of Array.from(sessions.entries())) {
    if (session.roomId === roomId) destroySession(session.roomId, session.terminalId);
  }
});

async function onAttach(ws, send, msg) {
  const token = String(msg.token || "");
  const roomId = String(msg.roomId || "");
  const terminalId = String(msg.terminalId || "default");
  const cols = Number(msg.cols) || 80;
  const rows = Number(msg.rows) || 24;
  const files = msg.files || [];
  const requestedLocal = msg.mode === "local" || Boolean(msg.isLocal);

  const auth = await validateTerminalAccess(token, roomId, msg.userId);
  if (!auth.ok) {
    send({ type: "attached", ok: false, terminalId, error: auth.error });
    return;
  }

  const isDockerReady = await checkDockerReady();
  const shouldUseLocal = requestedLocal || !isDockerReady;

  const key = sessionKey(auth.roomId, terminalId);
  let session = sessions.get(key);

  if (!session || !session.alive) {
    if (shouldUseLocal) {
      session = await spawnLocalPty(auth.roomId, terminalId, cols, rows, files);
    } else {
      try {
        const rc = await ensureRoomContainer(auth.roomId, files, assignDevServerPort(auth.roomId));
        session = await spawnPty(auth.roomId, terminalId, rc.container.id, cols, rows);
      } catch (dockerErr) {
        console.warn(`[terminal] Docker spawn failed (${dockerErr.message}), falling back to local shell`);
        session = await spawnLocalPty(auth.roomId, terminalId, cols, rows, files);
      }
    }
  } else {
    // Re-attach to the still-running pty: push the requested size now so the
    // reconnected client's viewport matches the shell's notion of geometry.
    try {
      session.pty.resize(cols, rows);
      session.cols = cols;
      session.rows = rows;
    } catch {}
  }

  session.subscribers.add(ws);
  if (!ws._subs) ws._subs = new Set();
  ws._subs.add(key);

  // Keep the editor's file explorer in sync (this notification travels over the
  // editor channel via socket.io, not over this byte stream).
  startWorkspaceWatcher(auth.roomId, activeIoRef);

  send({
    type: "attached",
    ok: true,
    roomId: auth.roomId,
    terminalId,
    isLocal: Boolean(session.isLocal),
    shell: session.shell || (session.isLocal ? "local shell" : "docker bash"),
    workspace: session.workspacePath || "",
    previewUrl: getDevServerUrl(auth.roomId),
    dockerReady: isDockerReady,
  });

  // Replay buffered scrollback so a late joiner / reconnected client sees the
  // existing shell state instead of a blank screen.
  if (session.outputBuffer) {
    const replay = /[\r\n]$/.test(session.outputBuffer)
      ? session.outputBuffer
      : session.outputBuffer + "\r\n";
    send({ type: "output", roomId: auth.roomId, terminalId, data: replay });
  }
  inc("terminal_attach_ok");
}

function handleConnection(ws) {
  if (!ws._subs) ws._subs = new Set();

  ws.on("message", async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== "string") return;

    try {
      switch (msg.type) {
        case "attach":
          await onAttach(ws, (o) => safeSend(ws, o), msg);
          break;

        case "input": {
          const session = sessions.get(sessionKey(msg.roomId, msg.terminalId));
          if (session && session.alive && typeof msg.data === "string" && msg.data.length) {
            // RAW byte pipe. No line buffering, no transformation — control
            // characters and arrow keys must reach the pty untouched.
            session.pty.write(msg.data);
            touchActivity(session.roomId);
          }
          break;
        }

        case "resize": {
          const session = sessions.get(sessionKey(msg.roomId, msg.terminalId));
          const cols = Number(msg.cols) || 80;
          const rows = Number(msg.rows) || 24;
          if (session && session.alive) {
            try {
              session.pty.resize(cols, rows);
              session.cols = cols;
              session.rows = rows;
            } catch {}
          }
          break;
        }

        case "heartbeat":
          if (msg.roomId) touchActivity(msg.roomId);
          break;

        case "sync-workspace":
          syncFilesToWorkspace(msg.roomId, msg.files || []);
          break;

        case "kill":
          destroySession(msg.roomId, msg.terminalId);
          safeSend(ws, { type: "killed", terminalId: msg.terminalId });
          break;

        default:
          break;
      }
    } catch (err) {
      recordError("pty_message_error", err.message);
      safeSend(ws, { type: "error", error: err.message });
    }
  });

  ws.on("close", () => {
    // Persist the pty across disconnects: just drop this subscriber; the
    // process keeps running server-side and will be re-attached on reconnect.
    if (ws._subs) {
      for (const key of ws._subs) {
        const session = sessions.get(key);
        if (session) session.subscribers.delete(ws);
      }
      ws._subs.clear();
    }
  });

  ws.on("error", () => {});
}

function safeSend(ws, obj) {
  if (ws.readyState === ws.OPEN) {
    try { ws.send(JSON.stringify(obj)); } catch {}
  }
}

module.exports = {
  handleConnection,
  setActiveIo,
  checkDockerReady,
  getDevServerUrl,
  destroySession,
  spawnLocalPty,
};
