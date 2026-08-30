const Docker = require("dockerode");
const { existsSync, mkdirSync, writeFileSync, readdirSync, statSync, readFileSync, watch } = require("fs");
const { join, resolve, sep, dirname } = require("path");
const { inc, setGauge, recordError } = require("./metrics");

const SANDBOX_IMAGE = process.env.TERMINAL_SANDBOX_IMAGE || "codetogether-sandbox:latest";
const WORKSPACE_ROOT = join(process.cwd(), "temp_workspaces");
const IDLE_TIMEOUT_MS = Number(process.env.TERMINAL_IDLE_TIMEOUT_MS || 30 * 60 * 1000);
const REAPER_INTERVAL_MS = 60_000;
const MAX_SYNC_FILE_SIZE = 512 * 1024;
const IGNORE_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage", ".turbo", ".cache"]);
const IGNORE_FILES = new Set(["package-lock.json", "yarn.lock", "pnpm-lock.yaml"]);

// Load-tested: `npm install vite react react-dom` peaks at ~364MB; vite dev
// server idles at ~253MB / 27 pids. 512MB caused OOM kills mid-install.
const MEMORY_LIMIT = Number(process.env.TERMINAL_MEMORY_MB || 1024) * 1024 * 1024;
const CPU_LIMIT = Number(process.env.TERMINAL_CPU_LIMIT || 1);
const PIDS_LIMIT = Number(process.env.TERMINAL_PIDS_LIMIT || 256);
const ALLOW_NETWORK = process.env.TERMINAL_ALLOW_NETWORK !== "false";

function resolveDockerSocket() {
  const candidates = [
    process.env.DOCKER_SOCKET,
    "/var/run/docker.sock",
    join(process.env.HOME || "", ".colima/default/docker.sock"),
    join(process.env.HOME || "", ".docker/run/docker.sock"),
  ];
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return process.env.DOCKER_SOCKET || "/var/run/docker.sock";
}

const docker = new Docker({ socketPath: resolveDockerSocket() });

/** @type {Map<string, RoomContainer>} roomId -> container state */
const roomContainers = new Map;

/** @type {Map<string, Set<string>>} roomId -> Set of socket.io socket ids (file-sync broadcast) */
const roomSockets = new Map;

/** @type {Map<string, fs.watch>} roomId -> fs.watch instance */
const roomWatchers = new Map;
// Per-room timestamp of the last editor->disk sync, used to avoid
// clobbering files changed externally (terminal/build tools) on disk.
const lastEditorSyncMs = new Map;

/** @type {Map<string, number>} roomId -> assigned dev server port */
const devServerPorts = new Map;

// Cleanup hooks registered by the pty/lsp services so that destroying a room's
// container also tears down the real backend processes (ptys / language servers)
// that depend on it. Each hook is `(roomId) => void`.
const roomCleanupHooks = new Set();

let dockerReady = null;
let reaperTimer = null;
let healthTimer = null;
let activeIo = null;

function containerKey(roomId) {
  return `ct-room-${roomId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

function getWorkspacePath(roomId) {
  return join(WORKSPACE_ROOT, roomId);
}

function touchActivity(roomId) {
  const rc = roomContainers.get(roomId);
  if (rc) rc.lastActivity = Date.now();
}

async function checkDockerReady() {
  if (dockerReady !== null) return dockerReady;
  try {
    await docker.ping();
    const images = await docker.listImages({ filters: { reference: [SANDBOX_IMAGE] } });
    dockerReady = images.length > 0;
    if (!dockerReady) {
      console.warn(`[terminal] Sandbox image "${SANDBOX_IMAGE}" not found. Build with: npm run docker:sandbox`);
    }
  } catch (err) {
    console.warn("[terminal] Docker unavailable:", err.message);
    dockerReady = false;
  }
  return dockerReady;
}

function syncFilesToWorkspace(roomId, files, reset = false) {
  const workspacePath = getWorkspacePath(roomId);
  if (reset && fs.existsSync(workspacePath)) {
    try {
      const entries = fs.readdirSync(workspacePath);
      for (const entry of entries) {
        if (entry === ".git") continue;
        fs.rmSync(resolve(workspacePath, entry), { recursive: true, force: true });
      }
    } catch {}
  }
  mkdirSync(workspacePath, { recursive: true });

  if (!Array.isArray(files)) return;

  let wrote = false;
  for (const file of files) {
    const relPath = String(file.path || file.name || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    if (!relPath || relPath.includes("..")) continue;
    const target = resolve(workspacePath, relPath);
    if (!target.startsWith(workspacePath + sep) && target !== workspacePath) continue;

    if (file.isFolder) {
      mkdirSync(target, { recursive: true });
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });

    if (typeof file.content === "string" && file.content.startsWith("data:") && file.content.includes(";base64,")) {
      const base64Data = file.content.split(";base64,").pop();
      writeFileSync(target, Buffer.from(base64Data, "base64"));
    } else {
      writeFileSync(target, file.content || "", "utf8");
    }
    wrote = true;
  }

  if (wrote) lastEditorSyncMs.set(roomId, Date.now());
}

async function ensureRoomContainer(roomId, files, portBinding) {
  touchActivity(roomId);

  if (!(await checkDockerReady())) {
    throw new Error("Docker is not available. Build the sandbox image and ensure Docker is running.");
  }

  syncFilesToWorkspace(roomId, files);

  let rc = roomContainers.get(roomId);
  if (rc && rc.container) {
    try {
      const inspect = await rc.container.inspect();
      if (inspect.State.Running) {
        rc.lastActivity = Date.now();
        return rc;
      }
    } catch {
      roomContainers.delete(roomId);
      rc = null;
    }
  }

  const workspacePath = getWorkspacePath(roomId);
  mkdirSync(workspacePath, { recursive: true });

  const name = containerKey(roomId);

  // Remove stale container with same name
  try {
    const existing = docker.getContainer(name);
    const info = await existing.inspect();
    if (info) await existing.remove({ force: true });
  } catch {}

  // Publish container port 5173 -> host port so in-container dev servers are
  // reachable by the browser preview panel. Walk up if the port is taken.
  let hostPort = Number(portBinding) > 0 ? Number(portBinding) : 0;

  const containerSpec = (port) => ({
    name,
    Image: SANDBOX_IMAGE,
    Cmd: ["sleep", "infinity"],
    WorkingDir: "/workspace",
    User: "codetogether",
    ExposedPorts: port ? { "5173/tcp": {} } : {},
    HostConfig: {
      Memory: MEMORY_LIMIT,
      NanoCpus: Math.floor(CPU_LIMIT * 1e9),
      PidsLimit: PIDS_LIMIT,
      NetworkMode: ALLOW_NETWORK ? "bridge" : "none",
      ReadonlyRootfs: true,
      SecurityOpt: ["no-new-privileges"],
      CapDrop: ["ALL"],
      Binds: [`${workspacePath}:/workspace:rw`],
      PortBindings: port ? { "5173/tcp": [{ HostPort: String(port) }] } : {},
      Tmpfs: {
        "/tmp": "size=512m,mode=1777,exec",
        "/home/codetogether/.npm": "size=256m,mode=1777,exec",
        "/home/codetogether/.cache": "size=256m,mode=1777,exec",
      },
    },
    Env: ["TERM=xterm-256color", "FORCE_COLOR=1", "HOME=/home/codetogether"],
  });

  let container = null;
  for (let attempt = 0; attempt < 12 && !container; attempt++) {
    try {
      container = await docker.createContainer(containerSpec(hostPort));
      await container.start();
    } catch (err) {
      const msg = String((err && err.message) || err);
      try { if (container) await container.remove({ force: true }); } catch {}
      container = null;
      if (hostPort && /already allocated|address already in use|driver failed programming external connectivity/i.test(msg)) {
        console.log(`[terminal] Host port ${hostPort} busy, retrying room ${roomId} on ${hostPort + 1}`);
        hostPort += 1;
        continue;
      }
      if (!/is already running|Conflict/i.test(msg)) {
        inc("containers_create_failed");
        recordError("container_create_failed", `${roomId}: ${msg}`);
      }
      throw err;
    }
  }
  if (!container) {
    inc("containers_create_failed");
    recordError("container_create_failed", `${roomId}: no free port`);
    throw new Error("Could not allocate a free host port for the dev-server preview (tried 12 ports).");
  }

  rc = {
    roomId,
    container,
    containerName: name,
    lastActivity: Date.now(),
    devServerHostPort: hostPort || undefined,
  };
  roomContainers.set(roomId, rc);
  devServerPorts.set(roomId, hostPort);
  inc("containers_created");
  refreshGauges();
  console.log(`[terminal] Started container ${name} for room ${roomId}${hostPort ? ` (preview: http://localhost:${hostPort})` : ""}`);

  return rc;
}

async function destroyRoomContainer(roomId) {
  const rc = roomContainers.get(roomId);
  if (!rc) return;

  // Tear down everything that depends on this container (ptys, lsp servers)
  // before removing it, so we don't leak real backend processes.
  for (const hook of roomCleanupHooks) {
    try { hook(roomId); } catch (err) { recordError("room_cleanup_hook", err.message); }
  }

  try {
    await rc.container.stop({ t: 5 });
    await rc.container.remove({ force: true });
  } catch {}

  // Clean up dev server port assignment
  devServerPorts.delete(roomId);

  roomContainers.delete(roomId);
  refreshGauges();
  console.log(`[terminal] Destroyed container for room ${roomId}`);
}

function assignDevServerPort(roomId) {
  const minPort = 5173;
  const maxPort = 6073;

  if (devServerPorts.has(roomId)) {
    return devServerPorts.get(roomId);
  }

  let port = minPort;
  while (port < maxPort) {
    if (!Array.from(devServerPorts.values()).includes(port)) {
      break;
    }
    port++;
  }

  if (port >= maxPort) {
    console.log("[terminal] No available dev server ports");
    return 0;
  }

  devServerPorts.set(roomId, port);
  return port;
}

function startWorkspaceWatcher(roomId, ioRef) {
  const broadcaster = ioRef || activeIo;
  if (roomWatchers.has(roomId)) {
    roomWatchers.get(roomId).close();
    roomWatchers.delete(roomId);
  }

  const workspacePath = join(process.cwd(), "temp_workspaces", roomId);
  if (!existsSync(workspacePath)) {
    console.log("[terminal] Workspace directory does not exist:", workspacePath);
    return;
  }

  let debounceTimeout;
  const watcher = watch(workspacePath, { recursive: true }, (eventType, filename) => {
    if (!filename) return;

    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(async () => {
      try {
        const files = collectWorkspaceFiles(roomId);
        // Broadcast to every socket.io client subscribed to this room's file
        // sync. This is editor/collab-channel traffic (file explorer updates),
        // NOT raw terminal bytes — it intentionally stays on socket.io.
        if (broadcaster) {
          broadcaster.to(roomId).emit("terminal:files-updated", { roomId, files });
        }
      } catch (err) {
        console.error("[terminal] File watcher error for room", roomId, ":", err);
      }
    }, 500);
  });

  roomWatchers.set(roomId, watcher);
}

// Map a file path to a Monaco/editor language id. Must match the client's
// getLangFromPath so that files synced from the container keep their syntax
// highlighting (a wrong/“plaintext” language silently drops all colors).
function getLangFromPath(path) {
  const ext = (path.split(".").pop() || "").toLowerCase();
  const map = {
    js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
    py: "python", java: "java", cpp: "cpp", cc: "cpp", cxx: "cpp", c: "c",
    cs: "csharp", go: "go", rs: "rust", php: "php", rb: "ruby", kt: "kotlin",
    kts: "kotlin", swift: "swift", scala: "scala", pl: "perl", r: "r", lua: "lua",
    dart: "dart", sh: "shell", bash: "shell", html: "html", css: "css",
    json: "json", md: "markdown", txt: "plaintext", yml: "yaml", yaml: "yaml",
    xml: "xml", sql: "sql",
  };
  return map[ext] || "plaintext";
}

function collectWorkspaceFiles(roomId) {
  const root = getWorkspacePath(roomId);
  const out = [];

  function walk(dir, rel = "") {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".env") continue;
      const nextRel = rel ? `${rel}/${entry.name}` : entry.name;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(entry.name)) continue;
        out.push({ name: nextRel, path: nextRel, content: "", language: "folder", isFolder: true });
        walk(full, nextRel);
      } else if (entry.isFile()) {
        if (IGNORE_FILES.has(entry.name)) continue;
        try {
          const st = statSync(full);
          if (st.size > MAX_SYNC_FILE_SIZE) continue;
          out.push({ name: nextRel, path: nextRel, content: readFileSync(full, "utf8"), language: getLangFromPath(nextRel) });
        } catch {}
      }
    }
  }

  if (existsSync(root)) walk(root);
  return out;
}

function getDevServerUrl(roomId) {
  const port = devServerPorts.get(roomId);
  return port ? `http://localhost:${port}` : null;
}

function refreshGauges() {
  setGauge("active_rooms", roomContainers.size);
}

// ── Health / reaper ──
const HEALTH_CHECK_INTERVAL_MS = Number(process.env.TERMINAL_HEALTH_INTERVAL_MS || 20_000);

async function healthCheckAllRooms() {
  for (const [roomId, rc] of roomContainers.entries()) {
    let healthy = false;
    let reason = "unknown";
    try {
      const info = await rc.container.inspect();
      if (info.State.Running && !info.State.OOMKilled && !info.State.Dead) healthy = true;
      else reason = info.State.OOMKilled ? "oom" : info.State.Dead ? "dead" : "stopped";
    } catch {
      reason = "unreachable";
    }
    if (!healthy) {
      console.warn(`[terminal] Health: container for ${roomId} unhealthy (${reason}) — destroying`);
      inc("health_recreates");
      if (reason === "oom") inc("oom_kills_detected");
      recordError(`container_${reason}`, `room ${roomId}`);
      await destroyRoomContainer(roomId);
    }
  }
}

function startHealthMonitor() {
  if (healthTimer) return;
  healthTimer = setInterval(() => {
    healthCheckAllRooms().catch((e) => recordError("health_loop", e.message));
  }, HEALTH_CHECK_INTERVAL_MS);
  if (healthTimer.unref) healthTimer.unref();
}

async function sweepOrphanedRoomContainers() {
  try {
    const knownNames = new Set(Array.from(roomContainers.keys()).map((k) => `/${containerKey(k)}`));
    const listed = await docker.listContainers({ all: true });
    let swept = 0;
    for (const info of listed) {
      const name = (info.Names || []).find((n) => n.startsWith("/ct-room-"));
      if (!name || knownNames.has(name)) continue;
      try {
        await docker.getContainer(info.Id).remove({ force: true });
        swept += 1;
        console.log(`[terminal] Startup sweep: removed orphaned container ${name.slice(1)}`);
      } catch {}
    }
    if (swept > 0) console.log(`[terminal] Startup sweep complete: ${swept} container(s) removed`);
  } catch {}
}

function startIdleReaper() {
  if (reaperTimer) return;
  sweepOrphanedRoomContainers();
  reaperTimer = setInterval(async () => {
    const now = Date.now();
    for (const [roomId, rc] of roomContainers.entries()) {
      const idle = now - rc.lastActivity;
      if (idle > IDLE_TIMEOUT_MS) {
        console.log(`[terminal] Idle reaper: destroying room ${roomId} (idle ${Math.round(idle / 1000)}s)`);
        inc("rooms_reaped_idle");
        await destroyRoomContainer(roomId);
      }
    }
    try {
      await docker.systemPrune({ force: true });
    } catch {}
  }, REAPER_INTERVAL_MS);
}

// ── Socket.IO wiring (editor/collab channel only) ──
// The raw terminal byte stream and LSP JSON-RPC live on their own dedicated
// WebSocket channels (see pty-service.js / lsp-service.js). The only terminal
// traffic that remains here is control + file-sync notifications that the
// editor/collaboration layer needs (file explorer updates).
function wireSocketIo(io, socket) {
  activeIo = io;

  // Track which socket.io clients want file-sync updates for a room.
  socket.on("terminal:join-room", (payload = {}) => {
    const roomId = String(payload.roomId || "");
    if (!roomId) return;
    socket.join(roomId);
    if (!roomSockets.has(roomId)) roomSockets.set(roomId, new Set());
    roomSockets.get(roomId).add(socket.id);
  });

  socket.on("terminal:leave-room", (payload = {}) => {
    const roomId = String(payload.roomId || "");
    if (!roomId) return;
    socket.leave(roomId);
    const set = roomSockets.get(roomId);
    if (set) set.delete(socket.id);
  });

  socket.on("disconnect", () => {
    for (const set of roomSockets.values()) set.delete(socket.id);
  });

  socket.on("terminal:destroy-room", async (payload = {}, ack) => {
    const reply = (result) => { if (typeof ack === "function") ack(result); };
    const token = String(payload.token || "");
    const roomId = String(payload.roomId || "");
    const { validateTerminalAccess } = require("./terminal-auth");
    const auth = await validateTerminalAccess(token, roomId, payload.userId);
    if (!auth.ok) {
      reply({ ok: false, error: auth.error });
      return;
    }
    await destroyRoomContainer(auth.roomId);
    reply({ ok: true });
  });
}

function startReliabilityLoops() {
  startIdleReaper();
  startHealthMonitor();
}

function registerCleanupHook(hook) {
  roomCleanupHooks.add(hook);
}

module.exports = {
  getDevServerUrl,
  touchActivity,
  checkDockerReady,
  ensureRoomContainer,
  destroyRoomContainer,
  syncFilesToWorkspace,
  collectWorkspaceFiles,
  startWorkspaceWatcher,
  assignDevServerPort,
  startReliabilityLoops,
  startIdleReaper,
  startHealthMonitor,
  registerCleanupHook,
  wireSocketIo,
  refreshGauges,
};
