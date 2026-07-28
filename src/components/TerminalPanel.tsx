"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { X, Trash2, Play, Square, ChevronRight } from "lucide-react";
import type { FileItem } from "@/components/FileExplorer";
import { supabase } from "@/lib/supabase";

type TerminalPanelProps = {
  onClose: () => void;
  roomId: string;
  codeRef: React.MutableRefObject<string>;
  language: string;
  activeFileName: string;
  triggerRun?: number;
  onWorkSave?: () => void;
  files?: FileItem[];
  onFilesSync?: (files: FileItem[]) => void;
};

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
}

function joinPath(base: string, next: string) {
  if (!next || next === ".") return base;
  if (next === "..") return base.split("/").slice(0, -1).join("/");
  const raw = next.startsWith("/") ? next : [base, next].filter(Boolean).join("/");
  const parts: string[] = [];
  normalizePath(raw).split("/").filter(Boolean).forEach(part => {
    if (part === ".") return;
    if (part === "..") parts.pop();
    else parts.push(part);
  });
  return parts.join("/");
}

export default function TerminalPanel({ onClose, roomId, codeRef, language, activeFileName, triggerRun = 0, onWorkSave, files = [], onFilesSync }: TerminalPanelProps) {
  const [height, setHeight] = useState(() => {
    if (typeof window === "undefined") return 280;
    return Math.min(360, Math.max(220, Math.round(window.innerHeight * 0.34)));
  });
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [running, setRunning] = useState(false);
  const sessionId = useRef(`sess_${roomId}_${Date.now()}`);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const inputLineRef = useRef("");
  const lastRunRef = useRef(0);
  const runningRef = useRef(false);
  const cwdRef = useRef("");
  const mountedRef = useRef(true);

  async function getAuthHeaders() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("No active session");
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`,
    };
  }

  function stopPoll() {
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; }
  }

  async function sendProcessInput(data: string, rawInput = false) {
    let headers: Record<string, string>;
    try {
      headers = await getAuthHeaders();
    } catch {
      return;
    }
    fetch("/api/terminal", {
      method: "POST", headers,
      body: JSON.stringify({ action: "input", sessionId: sessionId.current, data, rawInput }),
    });
  }

  const startPoll = useCallback(() => {
    stopPoll();
    const poll = async () => {
      try {
        const res = await fetch("/api/terminal", {
          method: "POST", headers: await getAuthHeaders(),
          body: JSON.stringify({ action: "output", sessionId: sessionId.current }),
        });
        if (!res.ok) { if (mountedRef.current) setRunning(false); return; }
        const { output, running: stillRunning, error, files: syncedFiles } = await res.json();
        if (mountedRef.current && output && output.length > 0) {
          output.forEach((chunk: string) => xtermRef.current?.write(chunk));
        }
        if (mountedRef.current && syncedFiles && syncedFiles.length > 0) {
          onFilesSync?.(syncedFiles);
          xtermRef.current?.writeln(`\r\n\x1b[36mSynced ${syncedFiles.filter((file: FileItem) => !file.isFolder).length} workspace file(s) to Explorer.\x1b[0m`);
        }
        if (mountedRef.current && error) xtermRef.current?.writeln(`\x1b[31m${error}\x1b[0m`);
        if (stillRunning) {
          pollRef.current = setTimeout(poll, 250);
        } else {
          runningRef.current = false;
          if (mountedRef.current) setRunning(false);
          if (xtermRef.current) {
            xtermRef.current.write("\r\n");
            prompt(xtermRef.current);
          }
        }
      } catch {
        stopPoll();
        runningRef.current = false;
        if (mountedRef.current) setRunning(false);
      }
    };
    pollRef.current = setTimeout(poll, 200);
  }, [onFilesSync]);

  // Init xterm
  useEffect(() => {
    if (!termRef.current) return;
    const term = new XTerm({
      theme: { background: "#0d0d0d", foreground: "#cccccc", cursor: "#7C3AED", cursorAccent: "#fff", selectionBackground: "rgba(124,58,237,0.3)", black: "#000", red: "#f44747", green: "#6bcb77", yellow: "#ffd93d", blue: "#60a5fa", magenta: "#c084fc", cyan: "#22d3ee", white: "#cccccc" },
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
      fontSize: 13, lineHeight: 1.4, cursorBlink: true, scrollback: 3000, convertEol: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(termRef.current);
      fit.fit();
    xtermRef.current = term;
    fitRef.current = fit;

    term.writeln("\x1b[1;35mCodeTogether Interactive Terminal\x1b[0m");
    term.writeln(`\x1b[90mSession ready · Room ${roomId.slice(0, 8)}\x1b[0m`);
    term.writeln("\x1b[90mPress ▶ Run or Ctrl+Enter to execute your code.\x1b[0m\r\n");
    term.write("\x1b[90m$ \x1b[0m");

    // Handle keyboard input
    term.onKey(({ key, domEvent }) => {
      const term = xtermRef.current!;
      if (runningRef.current) {
        if (domEvent.ctrlKey && domEvent.key === "c") {
          stopCode();
          return;
        }
        if (domEvent.key === "Enter") {
          sendProcessInput("\n", true);
          term.write("\r\n");
          inputLineRef.current = "";
        } else if (domEvent.key === "Backspace") {
          if (inputLineRef.current.length > 0) {
            inputLineRef.current = inputLineRef.current.slice(0, -1);
            sendProcessInput("\x7f", true);
            term.write("\b \b");
          }
        } else if (!domEvent.ctrlKey && key.length === 1) {
          inputLineRef.current += key;
          sendProcessInput(key, true);
          term.write(key);
        }
      } else {
        // Simple shell mode
        if (domEvent.key === "Enter") {
          const cmd = inputLineRef.current.trim();
          term.write("\r\n");
          if (cmd) handleShellCommand(cmd, term);
          else term.write("\x1b[90m$ \x1b[0m");
          inputLineRef.current = "";
        } else if (domEvent.key === "Backspace") {
          if (inputLineRef.current.length > 0) {
            inputLineRef.current = inputLineRef.current.slice(0, -1);
            term.write("\b \b");
          }
        } else if (domEvent.ctrlKey && domEvent.key === "c") {
          term.write("^C\r\n\x1b[90m$ \x1b[0m");
          inputLineRef.current = "";
        } else if (!domEvent.ctrlKey && !domEvent.altKey && key.length === 1) {
          inputLineRef.current += key;
          term.write(key);
        }
      }
    });

    const ro = new ResizeObserver(() => { fit.fit(); });
    if (termRef.current.parentElement) ro.observe(termRef.current.parentElement);
    return () => { ro.disconnect(); term.dispose(); stopPoll(); };
  }, []);

  async function startCommand(command: string, label?: string) {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    inputLineRef.current = "";
    if (label) xtermRef.current?.writeln(label);
    try {
      const res = await fetch("/api/terminal", {
        method: "POST", headers: await getAuthHeaders(),
          body: JSON.stringify({
            action: "start",
            sessionId: sessionId.current,
            command,
            cwd: cwdRef.current,
            files,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to start command");
      }
      startPoll();
    } catch (err) {
      if (mountedRef.current) {
        xtermRef.current?.writeln(`\x1b[31m✗ ${err instanceof Error ? err.message : "Failed to start command"}\x1b[0m`);
        xtermRef.current?.write("\x1b[90m$ \x1b[0m");
      }
      runningRef.current = false;
      setRunning(false);
    }
  }

  function prompt(term: XTerm) {
    term.write(`\x1b[90m${cwdRef.current ? cwdRef.current : ""}$ \x1b[0m`);
  }

  function handleShellCommand(cmd: string, term: XTerm) {
    if (cmd === "clear" || cmd === "cls") { term.clear(); prompt(term); return; }
    if (cmd === "help") {
      term.writeln("\x1b[33mAvailable commands:\x1b[0m");
      term.writeln("  \x1b[36mrun\x1b[0m        - Run current code file");
      term.writeln("  \x1b[36m<command>\x1b[0m  - Run shell commands like npm, node, ls, mkdir");
      term.writeln("  \x1b[36mcd <dir>\x1b[0m   - Change terminal folder");
      term.writeln("  \x1b[36mclear\x1b[0m      - Clear terminal");
      term.writeln("  \x1b[36mhelp\x1b[0m       - Show this help");
      prompt(term); return;
    }
    if (cmd === "run") { runCode(); return; }
    if (cmd === "pwd") {
      term.writeln(`/${cwdRef.current}`);
      prompt(term);
      return;
    }
    if (cmd.startsWith("cd ")) {
      cwdRef.current = joinPath(cwdRef.current, cmd.slice(3).trim());
      prompt(term);
      return;
    }
    startCommand(cmd);
  }

  const runCode = useCallback(async () => {
    if (runningRef.current) return;
    const now = Date.now();
    if (now - lastRunRef.current < 1000) return;
    lastRunRef.current = now;
    runningRef.current = true;
    setRunning(true);
    inputLineRef.current = "";
    const term = xtermRef.current!;
    term.writeln(`\r\n\x1b[1;32m▶ Running ${activeFileName}...\x1b[0m`);
    try {
      const res = await fetch("/api/terminal", {
        method: "POST", headers: await getAuthHeaders(),
        body: JSON.stringify({ action: "start", sessionId: sessionId.current, code: codeRef.current, language, cwd: cwdRef.current, files, activeFileName }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to start process");
      }
      startPoll();
      // Auto-stop after 30s to prevent runaway processes
      setTimeout(() => {
        if (runningRef.current) {
          getAuthHeaders()
            .then((headers) => fetch("/api/terminal", { method: "POST", headers, body: JSON.stringify({ action: "stop", sessionId: sessionId.current }) }))
            .catch(() => {});
          runningRef.current = false;
          if (mountedRef.current) setRunning(false);
          if (mountedRef.current) {
            term.writeln("\r\n\x1b[33m⏱ Process timeout (30s limit)\x1b[0m");
            term.write("\x1b[90m$ \x1b[0m");
          }
        }
      }, 30000);
    } catch (err) {
      if (mountedRef.current) {
        term.writeln(`\x1b[31m✗ ${err instanceof Error ? err.message : "Failed to start process."}\x1b[0m`);
        term.write("\x1b[90m$ \x1b[0m");
      }
      runningRef.current = false;
      setRunning(false);
    }
  }, [codeRef, language, activeFileName, startPoll, files]);

  const stopCode = useCallback(async () => {
    await fetch("/api/terminal", { method: "POST", headers: await getAuthHeaders(), body: JSON.stringify({ action: "stop", sessionId: sessionId.current }) });
    stopPoll();
    runningRef.current = false;
    if (mountedRef.current) setRunning(false);
    xtermRef.current?.writeln("\r\n\x1b[33m■ Process terminated\x1b[0m");
    xtermRef.current?.write("\x1b[90m$ \x1b[0m");
  }, []);

  useEffect(() => { if (triggerRun > 0) runCode(); }, [triggerRun]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopPoll();
    };
  }, []);

  // Resize drag
  const onDragStart = (e: React.MouseEvent) => {
    const startY = e.clientY, startH = height;
    const onMove = (me: MouseEvent) => {
      const newH = Math.max(160, Math.min(startH + (startY - me.clientY), window.innerHeight * 0.6));
      setHeight(newH);
      fitRef.current?.fit();
    };
    const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
    document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp);
    e.preventDefault();
  };

  return (
    <div style={{ height, display: "flex", flexDirection: "column", background: "#0d0d0d", borderTop: "1px solid #2a2a2a", position: "relative", flexShrink: 0, minHeight: 180, maxHeight: "60vh" }}>
      {/* Resize handle */}
      <div onMouseDown={onDragStart} style={{ position: "absolute", top: -3, left: 0, right: 0, height: 6, cursor: "ns-resize", zIndex: 10 }} />

      {/* Header */}
      <div style={{ height: 36, display: "flex", alignItems: "center", background: "#1a1a1a", borderBottom: "1px solid #2a2a2a", padding: "0 14px", gap: 12, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 12, flex: 1 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#7C3AED", textTransform: "uppercase", letterSpacing: "0.1em" }}>Terminal</span>
          <span style={{ fontSize: 11, color: "#555", fontFamily: "monospace" }}>{activeFileName}</span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {running ? (
            <button onClick={stopCode} title="Stop" style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 10px", background: "#f4474720", border: "1px solid #f4474740", borderRadius: 6, color: "#f47", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
              <Square size={11}/> Stop
            </button>
          ) : (
            <button onClick={runCode} title="Run code" style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 10px", background: "#22c55e20", border: "1px solid #22c55e40", borderRadius: 6, color: "#22c55e", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
              <Play size={11}/> Run
            </button>
          )}
          <button onClick={() => xtermRef.current?.clear()} title="Clear" style={{ padding: "3px 8px", background: "none", border: "none", color: "#555", cursor: "pointer", borderRadius: 4 }}>
            <Trash2 size={13}/>
          </button>
          <button onClick={onClose} title="Close" style={{ padding: "3px 8px", background: "none", border: "none", color: "#555", cursor: "pointer", borderRadius: 4 }}>
            <X size={14}/>
          </button>
        </div>
      </div>

      <div ref={termRef} style={{ flex: 1, overflow: "hidden", padding: "4px 2px" }} />
    </div>
  );
}
