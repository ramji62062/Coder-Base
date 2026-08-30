const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd());

const { createServer } = require("http");
const next = require("next");
const { Server } = require("socket.io");
const { WebSocketServer } = require("ws");
const { createClient } = require("@supabase/supabase-js");
const terminalService = require("./server/terminal-service");
const ptyService = require("./server/pty-service");
const lspService = require("./server/lsp-service");

const dev = process.env.NODE_ENV !== "production";

function resolveHostname() {
  if (process.env.NODE_ENV === "production") return "0.0.0.0";
  if (process.env.HOSTNAME && process.env.HOSTNAME !== "localhost") return process.env.HOSTNAME;
  return "localhost";
}

const hostname = resolveHostname();
const basePort = Number(process.env.PORT || 3000);
const rooms = new Map();
const allowedOrigins = (process.env.ALLOWED_ORIGIN || process.env.ALLOWED_ORIGINS || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = rawSupabaseUrl && serviceRoleKey
  ? createClient(rawSupabaseUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, ""), serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

function getRoom(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Map());
  return rooms.get(roomId);
}

function publicPeer(peer) {
  return {
    socketId: peer.socketId,
    userId: peer.userId,
    name: peer.name,
    micOn: peer.micOn,
    cameraOn: peer.cameraOn,
    screenOn: peer.screenOn,
  };
}

async function roomExists(roomId) {
  if (!roomId) return false;
  if (!/^[A-Za-z0-9_-]+$/.test(roomId)) return false;
  if (!supabaseAdmin) return true;

  try {
    const { data, error } = await supabaseAdmin
      .from("rooms")
      .select("id")
      .or(`id.eq.${roomId},room_code.eq.${roomId}`)
      .maybeSingle();

    if (error) {
      console.warn("[Socket] Room validation check warning:", error.message);
    }
    return true;
  } catch (err) {
    return true;
  }
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;

  if (dev) {
    try {
      const url = new URL(origin);
      return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    } catch {
      return false;
    }
  }

  return false;
}

function startServer(port) {
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();

  app.prepare().then(() => {
    const httpServer = createServer((req, res) => handle(req, res));
    const io = new Server(httpServer, {
      cors: {
        origin: (origin, callback) => {
          callback(null, isAllowedOrigin(origin));
        },
      },
      path: "/api/socket",
    });

    terminalService.startReliabilityLoops();
    terminalService.checkDockerReady().then((ready) => {
      console.log(`[terminal] Docker sandbox ${ready ? "ready" : "unavailable"}`);
    });

    // The editor/collab channel (socket.io) keeps only control + file-sync
    // notifications. The raw terminal byte stream and LSP JSON-RPC live on
    // their own dedicated WebSocket channels (see below).
    ptyService.setActiveIo(io);

    // Dedicated WebSocket server for the terminal + LSP channels. Each gets its
    // own path so the two never share a message handler or transport pipe.
    const wss = new WebSocketServer({ noServer: true });
    wss.on("connection", (ws, req) => {
      const pathname = new URL(req.url, "http://localhost").pathname;
      if (pathname === "/ws/terminal") ptyService.handleConnection(ws);
      else if (pathname === "/ws/lsp") lspService.handleConnection(ws, req);
      else ws.close();
    });
    httpServer.on("upgrade", (req, socket, head) => {
      const pathname = new URL(req.url, "http://localhost").pathname;
      if (pathname === "/ws/terminal" || pathname === "/ws/lsp") {
        wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
      }
      // All other upgrade requests (socket.io on /api/socket) are left for
      // socket.io's own upgrade handler to process.
    });

    io.on("connection", (socket) => {
      const { inc, setGauge, recordError } = require("./server/metrics");
      inc("ws_connects");
      if (socket.recovered) inc("ws_reconnects_recovered");
      setGauge("ws_connected", io.engine.clientsCount);
      socket.on("disconnect", (reason) => {
        inc("ws_disconnects");
        setGauge("ws_connected", io.engine.clientsCount);
        if (reason !== "transport close" && reason !== "ping timeout") {
          recordError("ws_disconnect_abnormal", reason);
        }
      });

      terminalService.wireSocketIo(io, socket);

      socket.on("call:join", async (payload = {}) => {
        const roomId = String(payload.roomId || "default");
        if (!(await roomExists(roomId))) {
          socket.emit("call:error", { error: "Room not found." });
          return;
        }

        const room = getRoom(roomId);
        const peer = {
          socketId: socket.id,
          userId: String(payload.userId || socket.id),
          name: String(payload.name || "User"),
          micOn: Boolean(payload.micOn),
          cameraOn: Boolean(payload.cameraOn),
          screenOn: Boolean(payload.screenOn),
        };

        socket.data.callRoomId = roomId;
        socket.data.callUserId = peer.userId;
        socket.join(roomId);
        socket.emit("call:peers", Array.from(room.values()).map(publicPeer));
        room.set(socket.id, peer);
        socket.to(roomId).emit("call:peer-joined", publicPeer(peer));
      });

      socket.on("call:signal", (payload = {}) => {
        if (!payload.to) return;
        socket.to(payload.to).emit("call:signal", {
          from: socket.id,
          signal: payload.signal,
        });
      });

      socket.on("call:state", (state = {}) => {
        const roomId = socket.data.callRoomId;
        if (!roomId) return;
        const room = getRoom(roomId);
        const peer = room.get(socket.id);
        if (!peer) return;

        peer.micOn = Boolean(state.micOn);
        peer.cameraOn = Boolean(state.cameraOn);
        peer.screenOn = Boolean(state.screenOn);
        io.to(roomId).emit("call:peer-state", publicPeer(peer));
      });

      socket.on("call:host-action", (payload = {}) => {
        const roomId = socket.data.callRoomId;
        if (!roomId || !payload.to || !payload.action) return;
        socket.to(payload.to).emit("call:host-action", {
          action: payload.action,
        });
      });

      socket.on("call:leave", () => {
        leaveCall(socket);
      });

      socket.on("disconnect", () => {
        leaveCall(socket);
      });

      function leaveCall(targetSocket) {
        const roomId = targetSocket.data.callRoomId;
        if (!roomId) return;
        const room = rooms.get(roomId);
        if (room) {
          room.delete(targetSocket.id);
          targetSocket.to(roomId).emit("call:peer-left", { socketId: targetSocket.id });
          if (room.size === 0) rooms.delete(roomId);
        }
        targetSocket.leave(roomId);
        targetSocket.data.callRoomId = undefined;
        targetSocket.data.callUserId = undefined;
      }
    });

    httpServer.on("error", (err) => {
      if (err.code === "EADDRINUSE" && port < basePort + 10) {
        console.warn(`[server] Port ${port} is busy, trying ${port + 1}...`);
        startServer(port + 1);
        return;
      }
      console.error("[server] Failed to start server:", err);
      process.exit(1);
    });

    httpServer.listen(port, hostname, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
  }).catch((err) => {
    console.error("[server] Next.js failed to prepare:", err);
    process.exit(1);
  });
}

startServer(basePort);
