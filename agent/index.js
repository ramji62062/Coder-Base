#!/usr/bin/env node

/**
 * CodeTogether Local Agent
 * Runs on the user's computer to provide real PTY terminal sessions
 * and secure workspace file synchronization for CodeTogether.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

// ── CLI Arguments ──
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    port: 8765,
    host: "127.0.0.1",
    dir: process.cwd(),
    token: "",
    room: "",
    server: "",
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-p" || arg === "--port") {
      options.port = parseInt(args[++i], 10) || 8765;
    } else if (arg === "-d" || arg === "--dir") {
      options.dir = path.resolve(args[++i]);
    } else if (arg === "-t" || arg === "--token") {
      options.token = args[++i];
    } else if (arg === "-h" || arg === "--host") {
      options.host = args[++i];
    } else if (arg === "-r" || arg.startsWith("--room")) {
      options.room = arg.includes("=") ? arg.split("=")[1] : args[++i];
    } else if (arg === "-s" || arg.startsWith("--server")) {
      options.server = arg.includes("=") ? arg.split("=")[1] : args[++i];
    } else if (arg === "--help") {
      options.help = true;
    }
  }

  return options;
}

const options = parseArgs();

if (options.help) {
  console.log(`
\x1b[1;36mCodeTogether Local Agent\x1b[0m
Bridge your local shell and workspace to CodeTogether with full security.

\x1b[1mUsage:\x1b[0m
  node agent/index.js [options]
  npm run agent -- [options]

\x1b[1mOptions:\x1b[0m
  -d, --dir <path>     Authorized workspace directory (default: current directory)
  -p, --port <port>    WebSocket port to listen on (default: 8765)
  -t, --token <token>  Custom security token (default: generated automatically)
  -h, --host <host>    Host address (default: 127.0.0.1 - local only)
  --help               Show this help message
`);
  process.exit(0);
}

let WebSocketServer;
try {
  WebSocketServer = require("ws").WebSocketServer;
} catch {
  try {
    const userWs = path.join(os.homedir(), ".codetogether", "node_modules", "ws");
    WebSocketServer = require(userWs).WebSocketServer;
  } catch {
    try {
      console.log("\x1b[36m[CodeTogether Agent] Installing required 'ws' package...\x1b[0m");
      const { execSync } = require("child_process");
      const targetDir = path.join(os.homedir(), ".codetogether");
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      execSync("npm install --no-audit --no-fund ws", { cwd: targetDir, stdio: "ignore" });
      WebSocketServer = require(path.join(targetDir, "node_modules", "ws")).WebSocketServer;
    } catch (err) {
      console.error(`
\x1b[31m[Error] The 'ws' module is required by the local agent.\x1b[0m
Please install dependencies:
  \x1b[36mcd ~/.codetogether && npm install ws\x1b[0m
`);
      process.exit(1);
    }
  }
}

// ── Workspace Directory Setup ──
const WORKSPACE_DIR = path.resolve(options.dir);
if (!fs.existsSync(WORKSPACE_DIR)) {
  try {
    fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
  } catch (err) {
    console.error(`\x1b[31mError creating workspace directory "${WORKSPACE_DIR}":\x1b[0m`, err.message);
    process.exit(1);
  }
}

// ── Token Generation / Persistence ──
const CONFIG_FILE = path.join(WORKSPACE_DIR, ".codetogether-agent.json");
let authToken = options.token;

if (!authToken) {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
      if (config.token && typeof config.token === "string") {
        authToken = config.token;
      }
    } catch {}
  }
}

if (!authToken) {
  authToken = `ct_local_${crypto.randomBytes(16).toString("hex")}`;
  try {
    fs.writeFileSync(
      CONFIG_FILE,
      JSON.stringify({ token: authToken, createdAt: new Date().toISOString() }, null, 2),
      { mode: 0o600 }
    );
  } catch {}
}

// ── Path Sandboxing & Traversal Prevention ──
function resolveSafePath(relPath) {
  const normalized = String(relPath || "")
    .replace(/\\/g, "/")
    .replace(/^(\.\.(\/|\\|$))+/, "")
    .replace(/^\/+|\/+$/g, "");

  if (normalized.includes("..")) return null;

  const target = path.resolve(WORKSPACE_DIR, normalized);
  if (!target.startsWith(WORKSPACE_DIR + path.sep) && target !== WORKSPACE_DIR) {
    return null;
  }
  return target;
}

// ── Language Detection from File Path ──
function getLangFromPath(filePath) {
  const ext = (filePath.split(".").pop() || "").toLowerCase();
  const map = {
    js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
    py: "python", java: "java", cpp: "cpp", cc: "cpp", cxx: "cpp", c: "c",
    cs: "csharp", go: "go", rs: "rust", php: "php", ruby: "ruby", rb: "ruby",
    kt: "kotlin", kts: "kotlin", swift: "swift", scala: "scala", pl: "perl",
    r: "r", lua: "lua", dart: "dart", sh: "shell", bash: "shell", zsh: "shell",
    html: "html", htm: "html", css: "css", scss: "scss", less: "less",
    json: "json", md: "markdown", txt: "plaintext", yml: "yaml", yaml: "yaml",
    xml: "xml", sql: "sql", vue: "vue", svelte: "svelte", toml: "toml",
  };
  return map[ext] || "plaintext";
}

const IGNORE_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "coverage", ".turbo", ".cache", ".idea", ".vscode",
]);
const IGNORE_FILES = new Set([
  ".DS_Store", "Thumbs.db", ".codetogether-agent.json",
]);
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

// ── File System Operations ──
function listWorkspaceFiles() {
  const out = [];

  function walk(dir, rel = "") {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".env" && entry.name !== ".gitignore") {
        if (entry.name === ".codetogether-agent.json") continue;
      }
      if (IGNORE_DIRS.has(entry.name) || IGNORE_FILES.has(entry.name)) continue;

      const nextRel = rel ? `${rel}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        out.push({
          name: nextRel,
          path: nextRel,
          content: "",
          language: "folder",
          isFolder: true,
        });
        walk(full, nextRel);
      } else if (entry.isFile()) {
        try {
          const st = fs.statSync(full);
          if (st.size > MAX_FILE_SIZE) {
            out.push({
              name: nextRel,
              path: nextRel,
              content: `// [File size ${Math.round(st.size / 1024)} KB exceeds 2MB limit for live sync]`,
              language: getLangFromPath(nextRel),
              mtimeMs: st.mtimeMs,
              size: st.size,
            });
            continue;
          }
          const content = fs.readFileSync(full, "utf8");
          out.push({
            name: nextRel,
            path: nextRel,
            content,
            language: getLangFromPath(nextRel),
            mtimeMs: st.mtimeMs,
            size: st.size,
          });
        } catch {}
      }
    }
  }

  walk(WORKSPACE_DIR);
  return out;
}

function readWorkspaceFile(relPath) {
  const safe = resolveSafePath(relPath);
  if (!safe) throw new Error("Path traversal prohibited or invalid path.");
  if (!fs.existsSync(safe)) throw new Error("File not found on disk.");
  const st = fs.statSync(safe);
  if (st.isDirectory()) throw new Error("Path is a directory.");
  const content = fs.readFileSync(safe, "utf8");
  return { content, mtimeMs: st.mtimeMs, size: st.size };
}

function writeWorkspaceFile(relPath, content, lastKnownMtime) {
  const safe = resolveSafePath(relPath);
  if (!safe) throw new Error("Path traversal prohibited or invalid path.");

  // Conflict Detection: check if disk file has changed externally
  if (fs.existsSync(safe)) {
    const st = fs.statSync(safe);
    const SLACK_MS = 1500;
    if (
      lastKnownMtime &&
      st.mtimeMs > lastKnownMtime + SLACK_MS
    ) {
      try {
        const diskContent = fs.readFileSync(safe, "utf8");
        if (diskContent !== content) {
          return {
            conflict: true,
            diskContent,
            diskMtime: st.mtimeMs,
            message: "File was modified on disk outside CodeTogether.",
          };
        }
      } catch {}
    }
  }

  const dir = path.dirname(safe);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(safe, content || "", "utf8");
  const st = fs.statSync(safe);
  return { ok: true, mtimeMs: st.mtimeMs, size: st.size };
}

function deleteWorkspaceFile(relPath) {
  const safe = resolveSafePath(relPath);
  if (!safe || safe === WORKSPACE_DIR) throw new Error("Invalid path or cannot delete workspace root.");
  if (!fs.existsSync(safe)) return { ok: true };
  const st = fs.statSync(safe);
  if (st.isDirectory()) {
    fs.rmSync(safe, { recursive: true, force: true });
  } else {
    fs.unlinkSync(safe);
  }
  return { ok: true };
}

// ── PTY / Shell Engine ──
let nodePty = null;
try {
  nodePty = require("node-pty");
} catch {
  // node-pty native module not found
}

function getDefaultShell() {
  if (process.platform === "win32") {
    return process.env.COMSPEC || "powershell.exe";
  }
  // Probe for a valid shell binary — SHELL env may point to something that doesn't exist on this host
  const candidates = [
    process.env.SHELL,
    "/bin/bash",
    "/usr/bin/bash",
    "/bin/zsh",
    "/usr/bin/zsh",
    "/bin/sh",
    "/usr/bin/sh",
  ].filter(Boolean);
  for (const sh of candidates) {
    try { if (fs.existsSync(sh)) return sh; } catch {}
  }
  return "/bin/sh"; // ultimate fallback
}

/** @type {Map<string, { pty: any, terminalId: string, subscribers: Set<any>, outputBuffer: string, alive: boolean }>} */
const sessions = new Map();
const MAX_OUTPUT_BUFFER = 512 * 1024;

function spawnLocalPty(terminalId, cols = 80, rows = 24) {
  if (sessions.has(terminalId)) {
    const existing = sessions.get(terminalId);
    if (existing.alive) {
      try { existing.pty.resize(cols, rows); } catch {}
      return existing;
    }
    sessions.delete(terminalId);
  }

  const shell = getDefaultShell();
  const args = process.platform === "win32" ? [] : ["--login"];

  let child = null;
  if (nodePty) {
    try {
      child = nodePty.spawn(shell, args, {
        name: "xterm-256color",
        cols: cols || 80,
        rows: rows || 24,
        cwd: WORKSPACE_DIR,
        env: {
          ...process.env,
          TERM: "xterm-256color",
          COLORTERM: "truecolor",
          FORCE_COLOR: "1",
        },
      });
    } catch (ptyErr) {
      console.warn("[agent] node-pty spawn failed:", ptyErr.message, "- Falling back to child_process");
      child = null;
    }
  }

  if (!child) {
    // Fallback using child_process.spawn
    const { spawn } = require("child_process");
    const fallbackArgs = process.platform === "win32" ? [] : ["-i"];
    const proc = spawn(shell, fallbackArgs, {
      cwd: WORKSPACE_DIR,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        FORCE_COLOR: "1",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    child = {
      onData: (cb) => {
        proc.stdout?.on("data", (d) => cb(d.toString()));
        proc.stderr?.on("data", (d) => cb(d.toString()));
      },
      onExit: (cb) => {
        proc.on("close", (code) => cb({ exitCode: code ?? 0 }));
      },
      write: (data) => {
        if (proc.stdin && !proc.stdin.destroyed) proc.stdin.write(data);
      },
      resize: () => {},
      kill: () => {
        try { proc.kill("SIGTERM"); } catch {}
      },
    };
  }

  const session = {
    terminalId,
    pty: child,
    cols,
    rows,
    subscribers: new Set(),
    outputBuffer: "",
    alive: true,
  };

  child.onData((data) => {
    if (!session.alive) return;
    session.outputBuffer = (session.outputBuffer + data).slice(-MAX_OUTPUT_BUFFER);
    const frame = JSON.stringify({ type: "output", terminalId, data });
    for (const ws of session.subscribers) {
      if (ws.readyState === ws.OPEN) ws.send(frame);
    }
  });

  child.onExit(({ exitCode }) => {
    session.alive = false;
    const frame = JSON.stringify({ type: "exit", terminalId, exitCode: exitCode ?? -1 });
    for (const ws of session.subscribers) {
      if (ws.readyState === ws.OPEN) ws.send(frame);
    }
    sessions.delete(terminalId);
  });

  sessions.set(terminalId, session);
  return session;
}

// ── HTTP & WebSocket Server ──
const server = http.createServer((req, res) => {
  // Simple health probe / info endpoint
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(
      JSON.stringify({
        status: "online",
        name: "CodeTogether Local Agent",
        version: "1.0.0",
        workspace: WORKSPACE_DIR,
        platform: os.platform(),
        shell: getDefaultShell(),
        hasNodePty: Boolean(nodePty),
      })
    );
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const reqToken = url.searchParams.get("token") || req.headers["x-agent-token"];

  // If a custom token was passed on CLI, require it; otherwise auto-allow localhost
  if (options.token && reqToken && reqToken !== authToken) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.authenticated = true;
    wss.emit("connection", ws, req);
  });
});

// ── Workspace File Watcher ──
let connectedClients = new Set();
let watchDebounceTimer = null;

try {
  fs.watch(WORKSPACE_DIR, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    if (filename.includes(".git") || filename.includes("node_modules") || filename.includes(".codetogether-agent.json")) {
      return;
    }

    clearTimeout(watchDebounceTimer);
    watchDebounceTimer = setTimeout(() => {
      try {
        const files = listWorkspaceFiles();
        const frame = JSON.stringify({ type: "file:change", eventType, filename, files });
        for (const ws of connectedClients) {
          if (ws.readyState === ws.OPEN && ws.authenticated) {
            ws.send(frame);
          }
        }
      } catch {}
    }, 400);
  });
} catch (err) {
  console.warn("\x1b[33m[watcher] fs.watch error:\x1b[0m", err.message);
}

// ── WebSocket Connection Handling ──
wss.on("connection", (ws, req) => {
  ws.subs = new Set();
  connectedClients.add(ws);

  function safeSend(obj) {
    if (ws.readyState === ws.OPEN) {
      try { ws.send(JSON.stringify(obj)); } catch {}
    }
  }

  // If already authenticated via upgrade URL
  if (ws.authenticated) {
    safeSend({
      type: "auth:ok",
      workspace: WORKSPACE_DIR,
      platform: os.platform(),
      shell: getDefaultShell(),
      hasNodePty: Boolean(nodePty),
      files: listWorkspaceFiles(),
    });
  }

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (!msg || typeof msg.type !== "string") return;

    // ── Authentication Message ──
    if (msg.type === "auth") {
      if (!options.token || msg.token === authToken || !msg.token) {
        ws.authenticated = true;
        safeSend({
          type: "auth:ok",
          workspace: WORKSPACE_DIR,
          platform: os.platform(),
          shell: getDefaultShell(),
          hasNodePty: Boolean(nodePty),
          files: listWorkspaceFiles(),
        });
      } else {
        safeSend({ type: "auth:error", error: "Invalid authentication token." });
        ws.close(4001, "Invalid token");
      }
      return;
    }

    // Require authentication for all subsequent operations
    if (!ws.authenticated) {
      safeSend({ type: "error", error: "Not authenticated. Send { type: 'auth', token: '...' } first." });
      return;
    }

    // ── Terminal Operations ──
    switch (msg.type) {
      case "attach": {
        const terminalId = String(msg.terminalId || "default");
        const cols = Number(msg.cols) || 80;
        const rows = Number(msg.rows) || 24;

        try {
          const session = spawnLocalPty(terminalId, cols, rows);
          session.subscribers.add(ws);
          ws.subs.add(terminalId);

          safeSend({
            type: "attached",
            ok: true,
            terminalId,
            workspace: WORKSPACE_DIR,
            shell: getDefaultShell(),
          });

          // Replay buffered scrollback
          if (session.outputBuffer) {
            safeSend({ type: "output", terminalId, data: session.outputBuffer });
          }
        } catch (err) {
          safeSend({ type: "attached", ok: false, terminalId, error: err.message });
        }
        break;
      }

      case "input": {
        const terminalId = String(msg.terminalId || "default");
        const session = sessions.get(terminalId);
        if (session && session.alive && typeof msg.data === "string") {
          session.pty.write(msg.data);
        }
        break;
      }

      case "resize": {
        const terminalId = String(msg.terminalId || "default");
        const session = sessions.get(terminalId);
        const cols = Number(msg.cols) || 80;
        const rows = Number(msg.rows) || 24;
        if (session && session.alive) {
          try { session.pty.resize(cols, rows); } catch {}
        }
        break;
      }

      case "kill": {
        const terminalId = String(msg.terminalId || "default");
        const session = sessions.get(terminalId);
        if (session) {
          try { session.pty.kill(); } catch {}
          session.alive = false;
          sessions.delete(terminalId);
        }
        safeSend({ type: "killed", terminalId });
        break;
      }

      // ── File System Operations ──
      case "file:list": {
        try {
          const files = listWorkspaceFiles();
          safeSend({ type: "file:list:ok", files });
        } catch (err) {
          safeSend({ type: "file:list:error", error: err.message });
        }
        break;
      }

      case "file:read": {
        try {
          const res = readWorkspaceFile(msg.path);
          safeSend({ type: "file:read:ok", path: msg.path, ...res });
        } catch (err) {
          safeSend({ type: "file:read:error", path: msg.path, error: err.message });
        }
        break;
      }

      case "file:write": {
        try {
          const result = writeWorkspaceFile(msg.path, msg.content, msg.lastMtime);
          if (result.conflict) {
            safeSend({
              type: "file:write:conflict",
              path: msg.path,
              diskContent: result.diskContent,
              diskMtime: result.diskMtime,
              message: result.message,
            });
          } else {
            safeSend({ type: "file:write:ok", path: msg.path, mtimeMs: result.mtimeMs, size: result.size });
          }
        } catch (err) {
          safeSend({ type: "file:write:error", path: msg.path, error: err.message });
        }
        break;
      }

      case "file:delete": {
        try {
          deleteWorkspaceFile(msg.path);
          safeSend({ type: "file:delete:ok", path: msg.path });
        } catch (err) {
          safeSend({ type: "file:delete:error", path: msg.path, error: err.message });
        }
        break;
      }

      case "ping": {
        safeSend({ type: "pong" });
        break;
      }

      default:
        break;
    }
  });

  ws.on("close", () => {
    connectedClients.delete(ws);
    if (ws.subs) {
      for (const terminalId of ws.subs) {
        const session = sessions.get(terminalId);
        if (session) session.subscribers.delete(ws);
      }
      ws.subs.clear();
    }
  });

  ws.on("error", () => {});
});

// ── Reverse Tunnel to Cloud Server ──
function connectReverseTunnel(serverUrl, roomId) {
  if (!serverUrl || !roomId) return;
  const wsProto = serverUrl.startsWith("https") ? "wss:" : "ws:";
  const host = serverUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const defaultShell = getDefaultShell();
  const tunnelUrl = `${wsProto}//${host}/ws/terminal?role=agent&roomId=${encodeURIComponent(roomId)}&shell=${encodeURIComponent(defaultShell)}&platform=${process.platform}`;

  console.log(`\x1b[36m[Tunnel] Connecting to CodeTogether Room "${roomId}" at ${wsProto}//${host}...\x1b[0m`);

  let tunnelWs = null;
  let retryTimer = null;

  function connect() {
    try {
      tunnelWs = new (require("ws"))(tunnelUrl);

      tunnelWs.on("open", () => {
        console.log(`\x1b[32m[Tunnel] ✅ Connected to Room "${roomId}"! Local terminal is now live in browser.\x1b[0m`);
      });

      tunnelWs.on("message", (raw) => {
        let msg;
        try { msg = JSON.parse(raw.toString()); } catch { return; }
        if (!msg || typeof msg.type !== "string") return;

        const terminalId = msg.terminalId || "default";

        switch (msg.type) {
          case "attach": {
            const cols = Number(msg.cols) || 80;
            const rows = Number(msg.rows) || 24;
            const session = spawnLocalPty(terminalId, cols, rows);

            // Re-route session output to tunnel WebSocket
            session.subscribers.add(tunnelWs);

            if (tunnelWs.readyState === tunnelWs.OPEN) {
              tunnelWs.send(JSON.stringify({
                type: "attached",
                terminalId,
                shell: defaultShell,
                workspace: WORKSPACE_DIR,
              }));
              if (session.outputBuffer) {
                tunnelWs.send(JSON.stringify({
                  type: "output",
                  terminalId,
                  data: session.outputBuffer,
                }));
              }
            }
            break;
          }

          case "input": {
            const session = sessions.get(terminalId);
            if (session && session.alive && typeof msg.data === "string") {
              session.pty.write(msg.data);
            }
            break;
          }

          case "resize": {
            const session = sessions.get(terminalId);
            const cols = Number(msg.cols) || 80;
            const rows = Number(msg.rows) || 24;
            if (session && session.alive) {
              try { session.pty.resize(cols, rows); } catch {}
            }
            break;
          }

          case "kill": {
            const session = sessions.get(terminalId);
            if (session) {
              try { session.pty.kill(); } catch {}
              sessions.delete(terminalId);
            }
            break;
          }
        }
      });

      tunnelWs.on("close", () => {
        console.log(`\x1b[33m[Tunnel] Disconnected from room ${roomId}. Reconnecting in 2s...\x1b[0m`);
        clearTimeout(retryTimer);
        retryTimer = setTimeout(connect, 2000);
      });

      tunnelWs.on("error", (err) => {
        console.warn(`\x1b[33m[Tunnel Error]\x1b[0m ${err.message}`);
      });
    } catch (err) {
      clearTimeout(retryTimer);
      retryTimer = setTimeout(connect, 2000);
    }
  }

  connect();
}

// ── Startup & Port Listening ──
function startListening(port) {
  server.listen(port, options.host, () => {
    const defaultShell = getDefaultShell();
    console.log(`
\x1b[1;32m===============================================================\x1b[0m
\x1b[1;36m  🚀 CodeTogether Local Companion is Running\x1b[0m
\x1b[1;32m===============================================================\x1b[0m

  \x1b[1mWorkspace Path:\x1b[0m   \x1b[33m${WORKSPACE_DIR}\x1b[0m
  \x1b[1mLocal URL:\x1b[0m        \x1b[36mws://${options.host}:${port}\x1b[0m
  \x1b[1mDefault Shell:\x1b[0m    \x1b[37m${defaultShell}\x1b[0m
  \x1b[1mPTY Engine:\x1b[0m       \x1b[32m${nodePty ? "node-pty (Real PTY)" : "child_process (fallback)"}\x1b[0m
${options.room ? `  \x1b[1mRoom Tunnel:\x1b[0m      \x1b[35m${options.room}\x1b[0m` : ""}

\x1b[1;30m---------------------------------------------------------------\x1b[0m
\x1b[1;37m  Your local terminal is now connected to CodeTogether!\x1b[0m
\x1b[1;32m===============================================================\x1b[0m
`);

    if (options.room && options.server) {
      connectReverseTunnel(options.server, options.room);
    }
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE" && !options.token && port < options.port + 10) {
      console.warn(`\x1b[33mPort ${port} busy, trying ${port + 1}...\x1b[0m`);
      startListening(port + 1);
    } else {
      console.error("\x1b[31mFailed to start local agent:\x1b[0m", err.message);
      process.exit(1);
    }
  });
}

startListening(options.port);
