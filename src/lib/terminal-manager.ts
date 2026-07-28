import { ChildProcess, execFile, execFileSync, spawn } from "child_process";
import { relative } from "path";
import { executionQueue } from "./execution-queue";

const SANDBOX_IMAGE = "codetogether-sandbox:latest";
const FINISHED_SESSION_TTL_MS = 60_000;
const MAX_OUTPUT_CHUNKS = 1000;

function quoteShell(value: string) {
  const escaped = value.replace(/'/g, "'\\''");
  return `'${escaped}'`;
}

function buildShellCommand(command: string, args: string[]) {
  if (!args || args.length === 0) return command;
  return `${command} ${args.map(quoteShell).join(" ")}`;
}

type Session = {
  process: ChildProcess;
  output: string[];
  running: boolean;
  exitCode: number | null;
  error: string | null;
  cwd: string;
  syncRoot: string;
  synced: boolean;
  containerName: string;
  releaseHeld: boolean;
  usesDocker: boolean;
  cleanupTimer?: NodeJS.Timeout;
};

class TerminalManager {
  private static instance: TerminalManager;
  private sessions: Map<string, Session> = new Map();

  private constructor() {}

  static getInstance() {
    if (!TerminalManager.instance) {
      TerminalManager.instance = new TerminalManager();
    }
    return TerminalManager.instance;
  }

  private assertDockerReady() {
    try {
      execFileSync("docker", ["info"], { stdio: "ignore", timeout: 5000 });
      execFileSync("docker", ["image", "inspect", SANDBOX_IMAGE], { stdio: "ignore", timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  private pushOutput(session: Session, data: string) {
    session.output.push(data);
    if (session.output.length > MAX_OUTPUT_CHUNKS) {
      session.output.splice(0, session.output.length - MAX_OUTPUT_CHUNKS);
    }
  }

  private releaseCapacity(session: Session) {
    if (!session.releaseHeld) return;
    session.releaseHeld = false;
    executionQueue.releaseTerminal();
  }

  private scheduleCleanup(sessionId: string, session: Session) {
    if (session.cleanupTimer) clearTimeout(session.cleanupTimer);
    session.cleanupTimer = setTimeout(() => {
      const current = this.sessions.get(sessionId);
      if (current && !current.running) {
        this.sessions.delete(sessionId);
      }
    }, FINISHED_SESSION_TTL_MS);
  }

  startSession(sessionId: string, command: string, args: string[], cwd: string, syncRoot = cwd) {
    this.stopSession(sessionId);
    const dockerReady = this.assertDockerReady();
    if (!dockerReady) {
      throw new Error("Docker sandbox is not available. Refusing to execute commands on the host.");
    }

    if (!executionQueue.acquireTerminal()) {
      throw new Error("Server terminal capacity reached. Please try again later.");
    }

    const relCwd = relative(syncRoot, cwd).split("\\").join("/");
    const containerCwd = relCwd ? `/workspace/${relCwd}` : "/workspace";
    const containerName = `codetogether_sess_${sessionId}`;
    const fullCommand = buildShellCommand(command, args || []);

    const proc = spawn("docker", [
          "run",
          "--name",
          containerName,
          "--rm",
          "-i",
          "-v",
          `${syncRoot}:/workspace`,
          "-w",
          containerCwd,
          "--memory=256m",
          "--cpus=0.5",
          "--pids-limit=100",
          "-e",
          "LANG=C.UTF-8",
          "-e",
          "LC_ALL=C.UTF-8",
          "--network",
          "none",
          "--security-opt",
          "no-new-privileges",
          "--cap-drop",
          "ALL",
          SANDBOX_IMAGE,
          "sh",
          "-c",
          fullCommand,
        ]);

    const session: Session = {
      process: proc,
      output: [],
      running: true,
      exitCode: null,
      error: null,
      cwd,
      syncRoot,
      synced: false,
      containerName,
      releaseHeld: true,
      usesDocker: true,
    };

    proc.stdout?.on("data", (data) => {
      this.pushOutput(session, data.toString());
    });

    proc.stderr?.on("data", (data) => {
      this.pushOutput(session, data.toString());
    });

    proc.on("error", (err) => {
      session.error = err.message;
      session.running = false;
      this.pushOutput(session, `\r\nProcess error: ${err.message}\r\n`);
      this.releaseCapacity(session);
      this.scheduleCleanup(sessionId, session);
    });

    proc.on("close", (code) => {
      session.running = false;
      session.exitCode = code;
      this.pushOutput(session, `\r\nProcess exited with code ${code ?? 0}\r\n`);
      this.releaseCapacity(session);
      this.scheduleCleanup(sessionId, session);
    });

    this.sessions.set(sessionId, session);
    return proc;
  }

  writeToStdin(sessionId: string, data: string) {
    const session = this.sessions.get(sessionId);
    if (session && session.process.stdin) {
      session.process.stdin.write(data);
    }
  }

  readSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    const out = [...session.output];
    session.output = [];
    return {
      output: out,
      running: session.running,
      exitCode: session.exitCode,
      error: session.error,
      cwd: session.cwd,
      syncRoot: session.syncRoot,
      synced: session.synced,
    };
  }

  markSynced(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (session) session.synced = true;
  }

  stopSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessions.delete(sessionId);
      if (session.cleanupTimer) clearTimeout(session.cleanupTimer);
      session.process.kill();
      if (session.usesDocker) {
        execFile("docker", ["kill", session.containerName], () => {});
      }
      this.releaseCapacity(session);
    }
  }
}

export const terminalManager = TerminalManager.getInstance();
