// ─────────────────────────────────────────────────────────────────────────────
// LSP channel — dedicated WebSocket `/ws/lsp`.
//
// This is a SEPARATE transport from the terminal (WebSocket `/ws/terminal`)
// and the editor/collab channel (socket.io). Structured JSON-RPC messages for
// the language server NEVER share a pipe with raw PTY bytes or CRDT sync — that
// isolation is what keeps the editor's state from being corrupted by terminal
// output and vice-versa.
//
// The real language server runs INSIDE the session's container (so it sees the
// user's actual files + installed packages) and is reached with
// `docker exec -i <container> <langserver>`. Note: `-i` only, NO `-t` — a TTY
// would rewrite newlines/CR and shatter the LSP Content-Length framing.
//
// Each (room, language) pair gets exactly one language-server process, which
// persists across client reconnects (we just re-bridge the new socket to the
// same process). Room teardown kills the process via the cleanup hook.
// ─────────────────────────────────────────────────────────────────────────────

const { spawn } = require("child_process");
const {
  WebSocketMessageReader,
  WebSocketMessageWriter,
  toSocket,
} = require("vscode-ws-jsonrpc");
const { StreamMessageReader, StreamMessageWriter } = require("vscode-jsonrpc");
const {
  ensureRoomContainer,
  assignDevServerPort,
  registerCleanupHook,
} = require("./terminal-service");
const { validateTerminalAccess } = require("./terminal-auth");
const { inc, recordError } = require("./metrics");

/** @type {Map<string, LspSession>} `${roomId}:${language}` -> session */
const sessions = new Map();

function sessionKey(roomId, language) {
  return `${roomId}:${language}`;
}

// Map an editor file extension to a language server + how to invoke it inside
// the container. Expand this list as new languages see real usage.
function resolveLanguageServer(language) {
  switch (language) {
    case "typescript":
    case "ts":
    case "tsx":
    case "javascript":
    case "js":
    case "jsx":
      return {
        language: "typescript",
        command: "typescript-language-server",
        args: ["--stdio"],
      };
    case "python":
    case "py":
      return {
        language: "python",
        command: "pylsp",
        args: [],
      };
    default:
      return null;
  }
}

async function getOrCreateSession(roomId, language, token, userId) {
  const auth = await validateTerminalAccess(token, roomId, userId);
  if (!auth.ok) return { error: auth.error };

  const ls = resolveLanguageServer(language);
  if (!ls) return { error: `No language server configured for "${language}".` };

  const key = sessionKey(auth.roomId, ls.language);
  let session = sessions.get(key);
  if (session && session.alive) return { session, auth };

  // Language server must run against the real project inside the container.
  const rc = await ensureRoomContainer(auth.roomId, [], assignDevServerPort(auth.roomId));
  const containerId = rc.container.id;

  let proc;
  try {
    proc = spawn(
      "docker",
      ["exec", "-i", "-w", "/workspace", containerId, ls.command, ...ls.args],
      { env: { ...process.env, TERM: "dumb" } },
    );
  } catch (err) {
    recordError("lsp_spawn_failed", `${key}: ${err.message}`);
    inc("lsp_spawn_failed");
    return { error: `Failed to start language server: ${err.message}` };
  }

  const procReader = new StreamMessageReader(proc.stdout);
  const procWriter = new StreamMessageWriter(proc.stdin);

  session = {
    roomId: auth.roomId,
    language: ls.language,
    proc,
    procReader,
    procWriter,
    subscribers: new Set(),
    alive: true,
  };

  // Server -> every connected editor client for this (room, language).
  procReader.listen((message) => {
    if (!session.alive) return;
    const frame = JSON.stringify(message);
    for (const sub of session.subscribers) {
      if (sub.readyState === sub.OPEN) sub.send(frame);
    }
  });

  proc.on("exit", (code) => {
    session.alive = false;
    sessions.delete(key);
    inc("lsp_exited");
    recordError("lsp_exit", `${key} exited (${code})`);
  });
  proc.on("error", (err) => {
    session.alive = false;
    sessions.delete(key);
    recordError("lsp_error", `${key}: ${err.message}`);
  });

  sessions.set(key, session);
  inc("lsp_spawned");
  return { session, auth };
}

function removeSubscriber(session, ws) {
  if (session) session.subscribers.delete(ws);
}

// Tear down language servers when their room's container goes away.
registerCleanupHook((roomId) => {
  for (const [key, session] of Array.from(sessions.entries())) {
    if (session.roomId === roomId) {
      try { session.proc.kill(); } catch {}
      session.alive = false;
      sessions.delete(key);
    }
  }
});

function handleConnection(ws, req) {
  const url = new URL(req.url, "http://localhost");
  const roomId = url.searchParams.get("roomId") || "";
  const token = url.searchParams.get("token") || "";
  const language = url.searchParams.get("language") || "";
  const userId = url.searchParams.get("userId") || "";

  // Wire the WebSocket as an LSP transport (messages are plain JSON-RPC).
  const socket = toSocket(ws);
  const wsReader = new WebSocketMessageReader(socket);
  const wsWriter = new WebSocketMessageWriter(socket);

  let session = null;

  getOrCreateSession(roomId, language, token, userId)
    .then(({ session: s, error }) => {
      if (error) {
        wsWriter.write({ jsonrpc: "2.0", id: null, error: { code: -32000, message: error } });
        try { ws.close(); } catch {}
        return;
      }
      session = s;
      session.subscribers.add(ws);

      // Client -> language server (raw JSON-RPC, no interpretation).
      wsReader.listen((message) => {
        if (session && session.alive) {
          try { session.procWriter.write(message); } catch (err) { recordError("lsp_relay_out", err.message); }
        }
      });
    })
    .catch((err) => {
      recordError("lsp_connect_failed", err.message);
      try { ws.close(); } catch {}
    });

  ws.on("close", () => {
    removeSubscriber(session, ws);
    try { wsReader.dispose(); } catch {}
    try { wsWriter.dispose(); } catch {}
  });
  ws.on("error", () => {});
}

module.exports = {
  handleConnection,
};
