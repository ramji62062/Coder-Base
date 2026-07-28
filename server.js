const { createServer } = require("http");
const next = require("next");
const { Server } = require("socket.io");
const { createClient } = require("@supabase/supabase-js");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = Number(process.env.PORT || 3000);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

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
  if (!supabaseAdmin) return dev;

  const { data, error } = await supabaseAdmin
    .from("rooms")
    .select("id")
    .or(`id.eq.${roomId},room_code.eq.${roomId}`)
    .maybeSingle();

  if (error) {
    console.error("[Socket] Room validation failed:", error.message);
    return dev;
  }

  return Boolean(data);
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

  io.on("connection", (socket) => {
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

  httpServer.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
