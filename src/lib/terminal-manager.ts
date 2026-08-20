import { ChildProcess, execFile, execFileSync, spawn } from "child_process";
import { relative } from "path";
import { executionQueue } from "./execution-queue";
import { executeWithPiston } from "./piston";

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
  process?: ChildProcess;
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

  public assertDockerReady() {
    return true;
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

  startPistonSession(sessionId: string, language: string, code: string, cwd: string, syncRoot = cwd, customFileName?: string) {
    this.stopSession(sessionId);

    const session: Session = {
      output: [],
      running: true,
      exitCode: null,
      error: null,
      cwd,
      syncRoot,
      synced: false,
      containerName: "",
      releaseHeld: false,
      usesDocker: false,
    };
    this.sessions.set(sessionId, session);

    executeWithPiston(language, code, customFileName).then((res) => {
      const current = this.sessions.get(sessionId);
      if (!current) return;
      if (res.stdout) {
        const lines = res.stdout.replace(/\r\n/g, "\n").split("\n");
        lines.forEach((line) => this.pushOutput(current, `${line}\r\n`));
      }
      if (res.stderr) {
        const lines = res.stderr.replace(/\r\n/g, "\n").split("\n");
        lines.forEach((line) => this.pushOutput(current, `\x1b[31m${line}\x1b[0m\r\n`));
      }
      current.running = false;
      current.exitCode = res.exitCode;
      this.pushOutput(current, `\r\n\x1b[90mProcess exited with code ${res.exitCode}\x1b[0m\r\n`);
      this.scheduleCleanup(sessionId, current);
    }).catch((err) => {
      const current = this.sessions.get(sessionId);
      if (!current) return;
      current.running = false;
      current.exitCode = 1;
      this.pushOutput(current, `\r\n\x1b[31mExecution error: ${err.message}\x1b[0m\r\n`);
      this.scheduleCleanup(sessionId, current);
    });

    return session;
  }

  startSession(sessionId: string, command: string, args: string[], cwd: string, syncRoot = cwd, allowNetwork = false) {
    this.stopSession(sessionId);

    if (!executionQueue.acquireTerminal()) {
      throw new Error("Server terminal capacity reached. Please try again later.");
    }

    const fullCommand = buildShellCommand(command, args || []);
    const shell = process.platform === "win32" ? "cmd" : "bash";
    const shellArgs = process.platform === "win32"
      ? ["/d", "/s", "/c", fullCommand]
      : ["-lc", fullCommand];

    try {
      const isNpmCommand = /^\s*(npm|yarn|pnpm|npx|bun)\b/.test(fullCommand.trim());
      const proc = spawn(shell, shellArgs, {
        cwd,
        env: { ...process.env, FORCE_COLOR: "1", BROWSER: "none", ...(isNpmCommand ? {} : { CI: "1" }) },
        stdio: ["pipe", "pipe", "pipe"],
        detached: false,
      });

      const session: Session = {
        process: proc,
        output: [],
        running: true,
        exitCode: null,
        error: null,
        cwd,
        syncRoot,
        synced: false,
        containerName: "",
        releaseHeld: true,
        usesDocker: false,
      };

      proc.stdout?.on("data", (data) => {
        this.pushOutput(session, data.toString());
      });

      proc.stderr?.on("data", (data) => {
        this.pushOutput(session, data.toString());
      });

      proc.on("error", () => {
        this.releaseCapacity(session);
        this.startPistonSession(sessionId, "bash", fullCommand, cwd, syncRoot);
      });

      proc.on("close", (code, signal) => {
        session.running = false;
        session.exitCode = code ?? (signal ? 1 : 0);
        if (!session.output.some((chunk) => chunk.includes("Process exited"))) {
          this.pushOutput(session, `\r\nProcess exited with code ${session.exitCode}\r\n`);
        }
        this.releaseCapacity(session);
        this.scheduleCleanup(sessionId, session);
      });

      this.sessions.set(sessionId, session);
      return proc;
    } catch {
      return this.startPistonSession(sessionId, "bash", fullCommand, cwd, syncRoot);
    }
  }

  writeToStdin(sessionId: string, data: string) {
    const session = this.sessions.get(sessionId);
    if (session && session.process && session.process.stdin) {
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
      if (session.process) {
        try {
          if (process.platform !== "win32" && session.process.pid) {
            process.kill(-session.process.pid, "SIGTERM");
          } else {
            session.process.kill("SIGTERM");
          }
        } catch {}
        if (session.usesDocker && session.containerName) {
          execFile("docker", ["kill", session.containerName], () => {});
        }
      }
      this.releaseCapacity(session);
    }
  }
}

export const terminalManager = TerminalManager.getInstance();
