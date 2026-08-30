# CodeTogether Real Terminal — Architecture & Migration Notes

## Status: Implemented ✅

The Piston-based single-shot execution has been augmented with a real, persistent,
interactive terminal (VS Code–style), backed by per-room Docker containers.

## Architecture

```
Browser (xterm.js)  ←— Socket.IO (/api/socket) —→  Node server (server.js)
     │                                                  │
     │ keystrokes → terminal:input                      ├─ server/terminal-auth.js
     │ ← terminal:output raw bytes                      │    (Supabase JWT + room membership)
     │ resize → terminal:resize                         └─ server/terminal-service.js
                                                          ├─ dockerode: 1 container / room
                                                          ├─ docker exec PTY bash (Tty: true)
                                                          └─ idle reaper (30 min default)
```

### Components

| Piece | File | Notes |
|---|---|---|
| Container manager | `server/terminal-service.js` | create/destroy, exec PTY, resize, kill, reaper |
| Auth gate | `server/terminal-auth.js` | validates Supabase JWT on **every** attach; checks room ownership/participation |
| Socket handlers | `server/terminal-service.js` → `registerTerminalHandlers()` | wired in `server.js` |
| Frontend | `src/components/TerminalPanel.tsx` | xterm.js + fit + webgl addons, multi-tab, keystroke streaming |
| Sandbox image | `docker/sandbox.Dockerfile` | debian slim + node, python, gcc/g++, go, java, git, ruby, rustc, php |

## Collaboration model

**One shared container + shared PTY sessions per room** (pair-programming model).
All room participants who attach to the same `terminalId` see the same live output
(buffer replay for late joiners) and can drive. Each tab (`term_<room>_<n>`) is a
separate shell inside the same container.

## Security checklist

- [x] Per-room Docker container — no arbitrary commands ever run on the host process
- [x] Hard limits: memory 512 MB, 1 CPU, 256 pids (env-tunable: `TERMINAL_MEMORY_MB`, `TERMINAL_CPU_LIMIT`, `TERMINAL_PIDS_LIMIT`)
- [x] Network isolation available: `TERMINAL_ALLOW_NETWORK=false` → `--network none`
- [x] Non-root user (`codetogether`), `ReadonlyRootfs`, `CapDrop ALL`, `no-new-privileges`
- [x] Writable space only: workspace bind mount + tmpfs for `/tmp`, npm cache
- [x] Supabase JWT validated on every `terminal:attach`; input/resize/kill only work after a successful attach binds the socket to the authenticated room (`socket.data.terminalRoomId`)
- [x] Path-traversal guard when syncing files into the workspace mount
- [x] Idle reaper destroys containers after 30 min without terminals/activity; explicit `terminal:destroy-room` on session end
- [x] Output buffer capped at 512 KB per session

## Docker setup (macOS dev)

Docker is not assumed to be preinstalled. `./start.sh` now:
1. Installs `colima` + `docker` CLI via Homebrew if missing
2. Starts the colima VM if the daemon isn't reachable
3. Builds `codetogether-sandbox:latest` if absent

`server/terminal-service.js` auto-detects the socket at `$DOCKER_SOCKET`,
`/var/run/docker.sock`, `~/.colima/default/docker.sock`, or `~/.docker/run/docker.sock`.

Manual one-time setup:

```bash
brew install colima docker
colima start --cpu 2 --memory 4 --disk 30
npm run docker:sandbox
npm run dev   # logs "[terminal] Docker sandbox ready"
```

## Migration notes: Piston vs real terminal

**Keep Piston** (`src/lib/piston.ts`, `/api/run-code`) only for:
- One-click "Run this file" fallback when Docker is unavailable (the Run button already falls back to this path automatically — see `TerminalPanel.runQuickCode`)
- Sandboxed grading-style single-shot runs, if added later

**Replaced by the terminal:**
- All interactive/stateful workflows: `cd`, env vars, `npm install`, multi-step builds, servers/dev-processes with Ctrl+C, pipes, git operations
- Any project type (Node/Python/Java/Go/C++/Ruby/Rust) since full toolchains live in the image
- Project scaffolding (Scaffold menu writes real commands into the PTY)

**Workspace sync:** editor files are pushed into the container's bind-mounted
workspace (`temp_workspaces/<roomId>`) on attach, on change, and on demand
(`terminal:sync-workspace`), so files survive reconnects and container restarts.
Files created inside the terminal appear back to collaborators through the same mount.
