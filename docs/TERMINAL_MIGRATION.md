# Terminal Migration Notes

## Overview

CodeTogether now uses a **real, persistent, interactive terminal** backed by Docker containers and PTY shells, replacing the previous HTTP-polling + host `spawn` approach for interactive use.

## Architecture

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Isolation | Docker (`dockerode`) | One container per room, shared by collaborators |
| Shell | Docker exec + TTY | Real bash with persistent state (`cd`, env, history) |
| Streaming | Socket.IO | Byte-stream I/O + resize events in real time |
| Frontend | xterm.js + WebGL addon | Dumb terminal emulator (no local shell logic) |
| Auth | Supabase JWT | Required for all terminal attach/input operations |

## Collaboration Model

**One container per room, shared terminal output.** Tutor and student see the same live terminal (pair-programming). Both can type into the same PTY. Output is broadcast to all attached clients. Late joiners receive buffered output.

## What Changed

### Replaced (interactive terminal)
- HTTP polling every 350ms → Socket.IO streaming
- Local fake prompt + input buffer → direct PTY keystroke forwarding
- Host `child_process.spawn` → Docker exec with TTY
- Per-command ephemeral processes → persistent bash shell

### Kept (Piston / one-shot execution)
- **DebugPanel** (`/api/run-code`) — single-file run with Docker sandbox + Piston fallback
- **Terminal Run button fallback** — when Docker is unavailable, falls back to Piston via `/api/terminal` `start` action
- **`run-command` action** — Piston bash for stateless command execution

## Setup

### 1. Build the sandbox image

```bash
docker build -f docker/sandbox.Dockerfile -t codetogether-sandbox:latest .
```

### 2. Ensure Docker is running

The server checks Docker on startup. Without it, the terminal shows a warning and Run falls back to Piston.

### 3. Environment variables (optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `TERMINAL_SANDBOX_IMAGE` | `codetogether-sandbox:latest` | Docker image name |
| `TERMINAL_IDLE_TIMEOUT_MS` | `1800000` (30 min) | Auto-kill idle containers |
| `TERMINAL_MEMORY_MB` | `512` | Container memory limit |
| `TERMINAL_CPU_LIMIT` | `1` | CPU cores limit |
| `TERMINAL_PIDS_LIMIT` | `256` | Process limit inside container |
| `TERMINAL_ALLOW_NETWORK` | `true` | Set `false` to disable outbound network |
| `DOCKER_SOCKET` | `/var/run/docker.sock` | Docker socket path |

## Security Checklist

- [x] **Container isolation** — no host shell access; all commands run inside Docker
- [x] **Resource limits** — memory, CPU, pids-limit enforced per container
- [x] **Non-root user** — containers run as `codetogether` user
- [x] **Read-only root filesystem** — only `/workspace` mount is writable
- [x] **Network restriction** — `NetworkMode: none` when `TERMINAL_ALLOW_NETWORK=false`
- [x] **Capability drop** — `CapDrop: ALL`, `no-new-privileges`
- [x] **Auth-gated attach** — JWT + room participant validation on every attach
- [x] **Room ownership** — users can only reach containers for rooms they participate in
- [x] **Idle reaper** — containers auto-destroyed after inactivity timeout
- [x] **Path traversal protection** — workspace sync validates paths

## Socket.IO Events

| Event | Direction | Purpose |
|-------|-----------|---------|
| `terminal:attach` | Client → Server | Authenticate + create/join PTY |
| `terminal:input` | Client → Server | Keystrokes → PTY stdin |
| `terminal:resize` | Client → Server | xterm cols/rows → PTY resize |
| `terminal:output` | Server → Client | PTY stdout/stderr stream |
| `terminal:exit` | Server → Client | Shell process exited |
| `terminal:kill` | Client → Server | Destroy terminal session |
| `terminal:sync-workspace` | Client → Server | Sync editor files to container volume |
| `terminal:destroy-room` | Client → Server | Explicit container cleanup |

## File Map

| File | Role |
|------|------|
| `server/terminal-service.js` | Container lifecycle, PTY management, idle reaper |
| `server/terminal-auth.js` | JWT + room participant validation |
| `server.js` | Registers terminal Socket.IO handlers |
| `src/components/TerminalPanel.tsx` | xterm.js + Socket.IO client |
| `src/app/api/terminal/route.ts` | Status, run-command helper, Piston fallback |
| `docker/sandbox.Dockerfile` | Sandbox image with toolchains + non-root user |

## When to Use What

| Use case | Mechanism |
|----------|-----------|
| Interactive shell (`npm install`, `git`, multi-step builds) | Docker PTY terminal (Socket.IO) |
| Quick "Run current file" with full project context | Run button → command injected into PTY |
| Quick single-file run without terminal open | DebugPanel → `/api/run-code` |
| Docker unavailable / no auth | Piston cloud fallback (stateless, no `cd`/install) |
