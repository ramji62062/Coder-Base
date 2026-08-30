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
const { consumePairing } = require("./agent-pairing");
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

function detectValidShell() {
  if (process.platform === "win32") {
    return process.env.COMSPEC || "powershell.exe";
  }
  const candidates = [
    process.env.SHELL,
    "/bin/bash",
    "/usr/bin/bash",
    "/bin/sh",
    "/usr/bin/sh",
    "/bin/zsh",
    "/usr/bin/zsh",
  ].filter(Boolean);

  for (const sh of candidates) {
    try {
      if (existsSync(sh)) return sh;
    } catch {}
  }
  return "/bin/sh";
}

// ─── Spawn a local shell (no Docker) ─────────────────────────────────
async function spawnLocalPty(roomId, terminalId, cols, rows, files) {
  const key = sessionKey(roomId, terminalId);
  const workspacePath = join(process.cwd(), "temp_workspaces", roomId);
  try { mkdirSync(workspacePath, { recursive: true }); } catch {}
  syncFilesToWorkspace(roomId, files);

  const shell = detectValidShell();
  const args = process.platform === "win32" ? [] : (shell.endsWith("sh") || shell.endsWith("bash") || shell.endsWith("zsh") ? ["-l"] : []);

  let wrapper;
  try {
    wrapper = spawnShell(shell, args, {
      cols, rows,
      cwd: workspacePath,
      env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor", FORCE_COLOR: "1" },
    });
  } catch (err) {
    try {
      wrapper = spawnShell("/bin/sh", [], {
        cols, rows,
        cwd: workspacePath,
        env: { ...process.env, TERM: "xterm-256color" },
      });
    } catch (fallbackErr) {
      recordError("pty_local_spawn_failed", `${key}: ${err.message}`);
      throw new Error(`Failed to start local shell: ${err.message}`);
    }
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
      try {
        session = await spawnLocalPty(auth.roomId, terminalId, cols, rows, files);
      } catch (localErr) {
        console.error(`[terminal] Local shell spawn failed: ${localErr.message}`);
        send({ type: "attached", ok: false, terminalId, error: `Shell spawn failed: ${localErr.message}` });
        return;
      }
    } else {
      try {
        const rc = await ensureRoomContainer(auth.roomId, files, assignDevServerPort(auth.roomId));
        session = await spawnPty(auth.roomId, terminalId, rc.container.id, cols, rows);
      } catch (dockerErr) {
        console.warn(`[terminal] Docker spawn failed (${dockerErr.message}), falling back to local shell`);
        try {
          session = await spawnLocalPty(auth.roomId, terminalId, cols, rows, files);
        } catch (localErr) {
          console.error(`[terminal] Local shell fallback also failed: ${localErr.message}`);
          send({ type: "attached", ok: false, terminalId, error: `No shell available: ${localErr.message}` });
          return;
        }
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

/** @type {Map<string, { ws: any, roomId: string, shell: string, platform: string, createdAt: number }>} */
const roomAgents = new Map();

/** @type {Map<string, Set<any>>} `${roomId}:${terminalId}` -> Set of browser WebSocket connections */
const browserSubscribers = new Map();

function handleConnection(ws, req) {
  const url = req ? new URL(req.url, "http://localhost") : null;
  const role = url ? url.searchParams.get("role") : null;
  const agentRoomId = url ? url.searchParams.get("roomId") : null;

  // ── Role A: Local Agent Reverse Tunnel Connection (from user's PC) ──
  if (role === "agent" && agentRoomId) {
    const pairToken = url.searchParams.get("pairToken") || url.searchParams.get("pair") || "";
    const pairing = consumePairing(pairToken, agentRoomId);
    if (!pairing.ok && process.env.NEXT_PUBLIC_SUPABASE_URL) {
      console.warn(`[tunnel] Rejecting local companion for room ${agentRoomId}: ${pairing.error}`);
      safeSend(ws, { type: "auth:error", error: pairing.error });
      ws.close(4001, pairing.error);
      return;
    }

    const shell = url.searchParams.get("shell") || "zsh";
    const platform = url.searchParams.get("platform") || process.platform;
    console.log(`[tunnel] Local companion connected for room ${agentRoomId} (${shell}, ${platform})`);

    const agentInfo = { ws, roomId: agentRoomId, shell, platform, createdAt: Date.now() };
    roomAgents.set(agentRoomId, agentInfo);

    // Broadcast agent arrival to all browser terminals in that room and re-bind
    // any already-open browser tabs to the new tunnel connection.
    for (const [key, subs] of browserSubscribers.entries()) {
      if (key.startsWith(`${agentRoomId}:`)) {
        const terminalId = key.slice(agentRoomId.length + 1);
        for (const browserWs of subs) {
          safeSend(browserWs, {
            type: "agent:connected",
            roomId: agentRoomId,
            terminalId,
            shell,
            platform,
          });
        }

        const attachState = Array.from(subs)
          .map((browserWs) => browserWs._terminalAttachState?.get(key))
          .find(Boolean);

        safeSend(ws, {
          type: "attach",
          roomId: agentRoomId,
          terminalId,
          cols: attachState?.cols || 80,
          rows: attachState?.rows || 24,
          files: attachState?.files || [],
        });
      }
    }

    ws.on("message", (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (!msg || typeof msg.type !== "string") return;

      const terminalId = msg.terminalId || "default";
      const key = `${agentRoomId}:${terminalId}`;
      const subs = browserSubscribers.get(key);

      switch (msg.type) {
        case "output":
          if (subs) {
            for (const browserWs of subs) {
              safeSend(browserWs, { type: "output", roomId: agentRoomId, terminalId, data: msg.data });
            }
          }
          break;

        case "exit":
          if (subs) {
            for (const browserWs of subs) {
              safeSend(browserWs, { type: "exit", roomId: agentRoomId, terminalId, exitCode: msg.exitCode });
            }
          }
          break;

        case "attached":
          if (subs) {
            for (const browserWs of subs) {
              safeSend(browserWs, {
                type: "attached",
                ok: true,
                roomId: agentRoomId,
                terminalId,
                isLocal: true,
                shell: msg.shell || shell,
                workspace: msg.workspace || "Local Machine",
              });
            }
          }
          break;

        case "files:sync":
          if (msg.files && activeIoRef) {
            activeIoRef.to(agentRoomId).emit("terminal:files-updated", { roomId: agentRoomId, files: msg.files });
          }
          break;

        case "pong":
          ws._lastPongAt = Date.now();
          break;
      }
    });

    const keepAlive = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        safeSend(ws, { type: "ping" });
      }
    }, 25000);

    ws.on("close", () => {
      clearInterval(keepAlive);
      console.log(`[tunnel] Local companion disconnected for room ${agentRoomId}`);
      if (roomAgents.get(agentRoomId)?.ws === ws) {
        roomAgents.delete(agentRoomId);
        for (const [key, subs] of browserSubscribers.entries()) {
          if (key.startsWith(`${agentRoomId}:`)) {
            for (const browserWs of subs) {
              safeSend(browserWs, { type: "agent:disconnected", roomId: agentRoomId });
            }
          }
        }
      }
    });
    return;
  }

  // ── Role B: Browser Client Connection ──
  if (!ws._subs) ws._subs = new Set();
  if (!ws._terminalAttachState) ws._terminalAttachState = new Map();

  ws.on("message", async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== "string") return;

    try {
      const agent = msg.roomId ? roomAgents.get(msg.roomId) : null;
      const key = `${msg.roomId}:${msg.terminalId || "default"}`;

      switch (msg.type) {
        case "attach":
          ws._terminalAttachState.set(key, {
            cols: Number(msg.cols) || 80,
            rows: Number(msg.rows) || 24,
            files: Array.isArray(msg.files) ? msg.files : [],
          });

          if (agent && agent.ws.readyState === agent.ws.OPEN) {
            if (!browserSubscribers.has(key)) browserSubscribers.set(key, new Set());
            browserSubscribers.get(key).add(ws);
            ws._subs.add(key);

            safeSend(agent.ws, {
              type: "attach",
              roomId: msg.roomId,
              terminalId: msg.terminalId || "default",
              cols: msg.cols || 80,
              rows: msg.rows || 24,
              files: msg.files || [],
            });

            safeSend(ws, {
              type: "agent:connecting",
              roomId: msg.roomId,
              terminalId: msg.terminalId || "default",
              shell: agent.shell,
            });
          } else {
            if (!browserSubscribers.has(key)) browserSubscribers.set(key, new Set());
            browserSubscribers.get(key).add(ws);
            ws._subs.add(key);
            await onAttach(ws, (o) => safeSend(ws, o), msg);
          }
          break;

        case "input": {
          if (agent && agent.ws.readyState === agent.ws.OPEN) {
            safeSend(agent.ws, { type: "input", terminalId: msg.terminalId, data: msg.data });
          } else {
            const session = sessions.get(sessionKey(msg.roomId, msg.terminalId));
            if (session && session.alive && typeof msg.data === "string" && msg.data.length) {
              session.pty.write(msg.data);
              touchActivity(session.roomId);
            }
          }
          break;
        }

        case "resize": {
          if (agent && agent.ws.readyState === agent.ws.OPEN) {
            safeSend(agent.ws, { type: "resize", terminalId: msg.terminalId, cols: msg.cols, rows: msg.rows });
          } else {
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
          }
          break;
        }

        case "heartbeat":
          if (msg.roomId) touchActivity(msg.roomId);
          break;

        case "sync-workspace":
          if (agent && agent.ws.readyState === agent.ws.OPEN) {
            safeSend(agent.ws, {
              type: "sync-workspace",
              roomId: msg.roomId,
              files: msg.files || [],
            });
          }
          syncFilesToWorkspace(msg.roomId, msg.files || []);
          break;

        case "kill":
          if (agent && agent.ws.readyState === agent.ws.OPEN) {
            safeSend(agent.ws, { type: "kill", terminalId: msg.terminalId });
          } else {
            destroySession(msg.roomId, msg.terminalId);
          }
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
    if (ws._subs) {
      for (const key of ws._subs) {
        const subs = browserSubscribers.get(key);
        if (subs) subs.delete(ws);
        const session = sessions.get(key);
        if (session) session.subscribers.delete(ws);
      }
      ws._subs.clear();
    }
    ws._terminalAttachState?.clear?.();
  });

  ws.on("error", () => {});
}

function safeSend(ws, obj) {
  if (ws && ws.readyState === ws.OPEN) {
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
