"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { X, Trash2, Play, Square, ChevronRight, Zap, ChevronDown } from "lucide-react";
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
  onPreviewUrlChange?: (url: string | null) => void;
  onOutputLog?: (text: string) => void;
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

function extractPreviewUrl(text: string) {
  if (!text) return null;
  const match = text.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[[^\]]+\]|[a-z0-9.-]+)(?::\d+)?(?:\/[^\s"'`<>]*)?/gi);
  if (!match) return null;
  const candidate = match[0].replace(/[),.;]+$/g, "");
  return candidate.replace("0.0.0.0", "127.0.0.1");
}

function findProjectRoot(files: FileItem[], activeFileName: string) {
  const normalizedActive = normalizePath(activeFileName);
  const candidates = new Set<string>();
  if (normalizedActive) candidates.add(normalizedActive);
  files.forEach((file) => {
    const path = normalizePath(file.path || file.name);
    if (path === "package.json" || path.endsWith("/package.json")) candidates.add(path);
    if (path === "vite.config.ts" || path.endsWith("/vite.config.ts") || path === "vite.config.js" || path.endsWith("/vite.config.js")) candidates.add(path);
    if (path === "next.config.js" || path.endsWith("/next.config.js") || path === "next.config.mjs" || path.endsWith("/next.config.mjs")) candidates.add(path);
  });

  const paths = Array.from(candidates);
  for (const entry of paths) {
    const normalized = normalizePath(entry);
    if (normalized.endsWith("/package.json") || normalized.endsWith("/vite.config.ts") || normalized.endsWith("/vite.config.js") || normalized.endsWith("/next.config.js") || normalized.endsWith("/next.config.mjs")) {
      const folder = normalized.split("/").slice(0, -1).join("/");
      if (folder) return folder;
    }
    if (normalized === "package.json" || normalized === "vite.config.ts" || normalized === "vite.config.js" || normalized === "next.config.js" || normalized === "next.config.mjs") {
      return ".";
    }
  }

  if (normalizedActive) {
    const segments = normalizedActive.split("/");
    for (let i = segments.length - 1; i > 0; i--) {
      const folder = segments.slice(0, i).join("/");
      const pkgPath = `${folder}/package.json`;
      if (files.some((file) => normalizePath(file.path || file.name) === pkgPath)) return folder;
    }
  }
  return "";
}

function formatApiOutput(data: { stdout?: string; stderr?: string; output?: string; error?: string }) {
  if (data.output) return data.output;
  return [data.stdout, data.stderr].filter(Boolean).join("\n");
}

async function readJsonResponse(res: Response) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Server returned ${res.status} ${res.statusText}: ${text.slice(0, 140)}`);
  }
}

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    "Content-Type": "application/json",
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  };
}

export default function TerminalPanel({ onClose, roomId, codeRef, language, activeFileName, triggerRun = 0, onWorkSave, files = [], onFilesSync, onPreviewUrlChange, onOutputLog }: TerminalPanelProps) {
  const [height, setHeight] = useState(() => {
    if (typeof window === "undefined") return 280;
    return Math.min(360, Math.max(220, Math.round(window.innerHeight * 0.34)));
  });
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [running, setRunning] = useState(false);
  const [scaffoldOpen, setScaffoldOpen] = useState(false);
  const sessionId = useRef(`sess_${roomId}_${Date.now()}`);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const inputLineRef = useRef("");
  const lastRunRef = useRef(0);
  const runningRef = useRef(false);
  const cwdRef = useRef("");
  const mountedRef = useRef(true);

  const SCAFFOLD_TEMPLATES = [
    { label: "Vite + React (TS)", cmd: "npm create vite@latest my-app" },
    { label: "Vite + React (JS)", cmd: "npm create vite@latest my-app" },
    { label: "Vite + Vue (TS)", cmd: "npm create vite@latest my-app" },
    { label: "Vite + Vue (JS)", cmd: "npm create vite@latest my-app" },
    { label: "Vite + Svelte", cmd: "npm create vite@latest my-app" },
    { label: "Next.js", cmd: "npx create-next-app@latest my-app" },
    { label: "Empty (package.json)", cmd: "mkdir -p my-project && cd my-project && npm init -y" },
  ];

  const executeScaffold = useCallback(async (cmd: string) => {
    if (!xtermRef.current) return;
    setScaffoldOpen(false);
    const term = xtermRef.current;
    term.writeln(`\r\n\x1b[1;36m⚡ Scaffolding project...\x1b[0m`);
    term.writeln(`\x1b[90m$ ${cmd}\x1b[0m\r\n`);
    await executeCommand(cmd);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const getPrompt = useCallback(() => {
    const dir = cwdRef.current ? cwdRef.current : "~";
    return `\r\n\x1b[1;37mcodetogether@workspace\x1b[0m:\x1b[1;37m${dir}\x1b[0m$ `;
  }, []);

  const writePrompt = useCallback(() => {
    if (!xtermRef.current) return;
    xtermRef.current.write(getPrompt());
    inputLineRef.current = "";
  }, [getPrompt]);

  useEffect(() => {
    if (!scaffoldOpen) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-scaffold-dropdown]")) setScaffoldOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [scaffoldOpen]);

  useEffect(() => {
    if (!termRef.current || xtermRef.current) return;

    const term = new XTerm({
      theme: {
        background: "#0a0a0a",
        foreground: "#cccccc",
        cursor: "#ffffff",
        selectionBackground: "rgba(255,255,255,0.2)",
      },
      fontFamily: "Menlo, Monaco, 'Courier New', monospace",
      fontSize: 13,
      cursorBlink: true,
      scrollback: 1000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(termRef.current);
    fit.fit();

    xtermRef.current = term;
    fitRef.current = fit;

    term.writeln("\x1b[1;37mCodeTogether Interactive Terminal\x1b[0m");
    term.writeln("Type commands, run code, or test scripts in real time.");
    term.write(getPrompt());

    term.onData((data) => {
      if (runningRef.current) {
        sendInputToBackend(data);
        return;
      }

      if (data === "\r") {
        const cmd = inputLineRef.current.trim();
        term.writeln("");
        if (cmd) {
          executeCommand(cmd);
        } else {
          writePrompt();
        }
      } else if (data === "\x7f") {
        if (inputLineRef.current.length > 0) {
          inputLineRef.current = inputLineRef.current.slice(0, -1);
          term.write("\b \b");
        }
      } else if (data >= " " || data === "\t") {
        inputLineRef.current += data;
        term.write(data);
      }
    });

    const handleResize = () => fit.fit();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (pollRef.current) clearInterval(pollRef.current);
      term.dispose();
      xtermRef.current = null;
    };
  }, [getPrompt, writePrompt]);

  const sendInputToBackend = async (data: string) => {
    try {
      await fetch("/api/terminal", {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify({ action: "input", sessionId: sessionId.current, data, rawInput: true }),
      });
    } catch {}
  };

  const pollSessionOutput = useCallback((id: string) => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/terminal", {
          method: "POST",
          headers: await getAuthHeaders(),
          body: JSON.stringify({ action: "output", sessionId: id }),
        });
        const data = await readJsonResponse(res);
        const chunks = Array.isArray(data.output) ? data.output : data.output ? [data.output] : [];

        if (chunks.length && xtermRef.current) {
          const output = chunks.join("");
          xtermRef.current.write(output.replace(/\n/g, "\r\n"));
          onOutputLog?.(output);
          const url = extractPreviewUrl(output);
          if (url) onPreviewUrlChange?.(url);
        }

        if (data.files && onFilesSync) {
          onFilesSync(data.files);
        }

        if (!data.running) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          if (mountedRef.current) {
            setRunning(false);
            runningRef.current = false;
            writePrompt();
          }
        }
      } catch (err: any) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        if (xtermRef.current) {
          xtermRef.current.writeln(`\r\n\x1b[31mTerminal error: ${err.message}\x1b[0m`);
        }
        if (mountedRef.current) {
          setRunning(false);
          runningRef.current = false;
          writePrompt();
        }
      }
    }, 450);
  }, [onFilesSync, onOutputLog, onPreviewUrlChange, writePrompt]);

  const executeCommand = async (cmd: string) => {
    if (!xtermRef.current) return;
    const term = xtermRef.current;

    if (cmd === "clear" || cmd === "cls") {
      term.clear();
      writePrompt();
      return;
    }

    if (cmd.startsWith("cd ")) {
      const target = cmd.slice(3).trim();
      cwdRef.current = joinPath(cwdRef.current, target);
      writePrompt();
      return;
    }

    setRunning(true);
    runningRef.current = true;

    try {
      const res = await fetch("/api/terminal", {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          action: "start",
          command: cmd,
          sessionId: sessionId.current,
          cwd: cwdRef.current,
          files,
        }),
      });

      const data = await readJsonResponse(res);
      if (!res.ok || data.error) {
        throw new Error(data.error || `Terminal request failed (${res.status})`);
      }
      pollSessionOutput(data.sessionId || sessionId.current);
    } catch (err: any) {
      term.writeln(`\r\n\x1b[31mError running command: ${err.message}\x1b[0m`);
      if (mountedRef.current) setRunning(false);
      runningRef.current = false;
      writePrompt();
    }
  };

  const runCode = useCallback(async () => {
    if (!xtermRef.current) return;
    const term = xtermRef.current;

    const projectRoot = findProjectRoot(files, activeFileName);
    const targetCwd = projectRoot || cwdRef.current;

    setRunning(true);
    runningRef.current = true;

    term.writeln(`\r\n\x1b[1;37mRunning ${activeFileName}...\x1b[0m`);

    try {
      const res = await fetch("/api/terminal", {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          action: "start",
          code: codeRef.current,
          language,
          activeFileName,
          sessionId: sessionId.current,
          files,
          cwd: targetCwd,
        }),
      });

      const data = await readJsonResponse(res);
      if (!res.ok || data.error) {
        throw new Error(data.error || `Terminal request failed (${res.status})`);
      }
      pollSessionOutput(data.sessionId || sessionId.current);
    } catch (err: any) {
      term.writeln(`\x1b[31mExecution failed: ${err.message}\x1b[0m`);
      if (mountedRef.current) setRunning(false);
      runningRef.current = false;
      writePrompt();
    }
  }, [activeFileName, codeRef, files, language, pollSessionOutput, writePrompt]);

  const stopCode = async () => {
    try {
      await fetch("/api/terminal", {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify({ action: "stop", sessionId: sessionId.current }),
      });
    } catch {}
    setRunning(false);
    runningRef.current = false;
    if (xtermRef.current) {
      xtermRef.current.writeln("\r\n\x1b[31m[Process terminated]\x1b[0m");
      writePrompt();
    }
  };

  useEffect(() => {
    if (triggerRun > 0 && triggerRun !== lastRunRef.current) {
      lastRunRef.current = triggerRun;
      runCode();
    }
  }, [triggerRun, runCode]);

  const onDragStart = (e: React.MouseEvent) => {
    const startY = e.clientY;
    const startH = height;
    const onMove = (me: MouseEvent) => {
      const newH = Math.max(180, Math.min(window.innerHeight * 0.6, startH - (me.clientY - startY)));
      setHeight(newH);
      fitRef.current?.fit();
    };
    const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
    document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp);
    e.preventDefault();
  };

  return (
    <div style={{ height }} className="flex flex-col bg-ct-dark-black border-t border-[#2a2a2a] relative shrink-0 min-h-[180px] max-h-[60vh] text-gray-200">
      {/* Resize handle */}
      <div onMouseDown={onDragStart} className="absolute -top-[3px] left-0 right-0 h-[6px] cursor-ns-resize z-10" />

      {/* Header */}
      <div className="h-[36px] flex items-center bg-ct-dark-black border-b border-[#2a2a2a] px-3.5 gap-3 shrink-0">
        <div className="flex gap-3 flex-1">
          <span className="text-[11px] font-bold text-white uppercase tracking-wider">Terminal</span>
          <span className="text-[11px] text-gray-400 font-mono">{activeFileName}</span>
        </div>
        <div className="flex gap-1.5 items-center relative">
          <div className="relative" data-scaffold-dropdown>
            <button
              onClick={() => setScaffoldOpen(!scaffoldOpen)}
              title="Quick scaffold project"
              className="flex items-center gap-1 px-2.5 py-0.5 bg-purple-500/20 border border-purple-500/40 rounded text-purple-300 cursor-pointer text-[11px] font-bold hover:bg-purple-500/30 transition-colors"
            >
              <Zap size={11} /> Scaffold <ChevronDown size={10} />
            </button>
            {scaffoldOpen && (
              <div className="absolute top-full right-0 mt-1 bg-[#1a1a2e] border border-[#333] rounded-lg shadow-2xl z-50 min-w-[220px] overflow-hidden">
                {SCAFFOLD_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.label}
                    onClick={() => executeScaffold(tpl.cmd)}
                    className="w-full text-left px-3 py-2 text-[11px] text-gray-200 hover:bg-purple-500/20 cursor-pointer border-none bg-transparent transition-colors flex items-center gap-2"
                  >
                    <Zap size={10} className="text-purple-400 shrink-0" /> {tpl.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {running ? (
            <button onClick={stopCode} title="Stop" className="flex items-center gap-1 px-2.5 py-0.5 bg-red-500/20 border border-red-500/40 rounded text-red-400 cursor-pointer text-[11px] font-bold">
              <Square size={11}/> Stop
            </button>
          ) : (
            <button onClick={runCode} title="Run code" className="flex items-center gap-1 px-2.5 py-0.5 bg-white border border-white rounded text-black cursor-pointer text-[11px] font-bold hover:bg-gray-200 transition-colors">
              <Play size={11} fill="black" /> Run
            </button>
          )}
          <button onClick={() => xtermRef.current?.clear()} title="Clear" className="p-[3px_8px] bg-transparent border-none text-gray-400 cursor-pointer rounded hover:text-white">
            <Trash2 size={13}/>
          </button>
          <button onClick={onClose} title="Close" className="p-[3px_8px] bg-transparent border-none text-gray-400 cursor-pointer rounded hover:text-white">
            <X size={14}/>
          </button>
        </div>
      </div>

      <div ref={termRef} className="flex-1 overflow-hidden p-[4px_2px]" />
    </div>
  );
}
