"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { X, Trash2, Play, Square, Zap, ChevronDown, Plus, Terminal as TerminalIcon } from "lucide-react";
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

type TerminalTab = {
  id: string;
  title: string;
  sessionId: string;
  running: boolean;
  cwd: string;
};

type TabRuntime = {
  term: XTerm;
  fit: FitAddon;
  pollTimer: NodeJS.Timeout | null;
  inputBuffer: string;
  history: string[];
  historyIndex: number;
  running: boolean;
  cwd: string;
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

async function readJsonResponse(res: Response) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { output: text };
  }
}

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    "Content-Type": "application/json",
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  };
}

export default function TerminalPanel({
  onClose,
  roomId,
  codeRef,
  language,
  activeFileName,
  triggerRun = 0,
  files = [],
  onFilesSync,
  onPreviewUrlChange,
  onOutputLog,
}: TerminalPanelProps) {
  const [height, setHeight] = useState(() => {
    if (typeof window === "undefined") return 280;
    return Math.min(360, Math.max(220, Math.round(window.innerHeight * 0.34)));
  });

  const [tabs, setTabs] = useState<TerminalTab[]>(() => [
    {
      id: "tab-1",
      title: "1: bash",
      sessionId: `sess_${roomId}_1_${Date.now()}`,
      running: false,
      cwd: "",
    },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>("tab-1");
  const [scaffoldOpen, setScaffoldOpen] = useState(false);

  const containerRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const runtimesRef = useRef<Map<string, TabRuntime>>(new Map());
  const nextTabNumRef = useRef(2);
  const lastRunRef = useRef(0);
  const mountedRef = useRef(true);

  const SCAFFOLD_TEMPLATES = [
    { label: "Vite + React (TS)", cmd: "npm create vite@latest my-app -- --template react-ts" },
    { label: "Vite + React (JS)", cmd: "npm create vite@latest my-app -- --template react" },
    { label: "Vite + Vue (TS)", cmd: "npm create vite@latest my-app -- --template vue-ts" },
    { label: "Vite + Svelte", cmd: "npm create vite@latest my-app -- --template svelte-ts" },
    { label: "Next.js App", cmd: "npx create-next-app@latest my-app --yes" },
    { label: "Node Project (npm init)", cmd: "mkdir -p my-project && cd my-project && npm init -y" },
    { label: "Python HTTP Server", cmd: "python3 -m http.server 8000" },
  ];

  const getPrompt = useCallback((cwd: string) => {
    const dir = cwd ? cwd : "~";
    return `\r\n\x1b[1;32mcodetogether@workspace\x1b[0m:\x1b[1;34m${dir}\x1b[0m$ `;
  }, []);

  const writePromptForTab = useCallback((tabId: string) => {
    const rt = runtimesRef.current.get(tabId);
    if (!rt) return;
    rt.term.write(getPrompt(rt.cwd));
    rt.inputBuffer = "";
  }, [getPrompt]);

  const sendInputToBackend = async (sessionId: string, data: string) => {
    try {
      await fetch("/api/terminal", {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify({ action: "input", sessionId, data, rawInput: true }),
      });
    } catch {}
  };

  const sendSignalToBackend = async (sessionId: string, signal = "SIGINT") => {
    try {
      await fetch("/api/terminal", {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify({ action: "signal", sessionId, signal }),
      });
    } catch {}
  };

  const pollSessionOutput = useCallback((tabId: string, sessId: string) => {
    const rt = runtimesRef.current.get(tabId);
    if (!rt) return;
    if (rt.pollTimer) clearInterval(rt.pollTimer);

    rt.pollTimer = setInterval(async () => {
      if (!mountedRef.current) return;
      try {
        const res = await fetch("/api/terminal", {
          method: "POST",
          headers: await getAuthHeaders(),
          body: JSON.stringify({ action: "output", sessionId: sessId }),
        });
        const data = await readJsonResponse(res);
        const chunks = Array.isArray(data.output) ? data.output : data.output ? [data.output] : [];

        if (chunks.length && rt.term) {
          const output = chunks.join("");
          rt.term.write(output.replace(/\r?\n/g, "\r\n"));
          onOutputLog?.(output);
          const url = extractPreviewUrl(output);
          if (url) onPreviewUrlChange?.(url);
        }

        if (data.files && onFilesSync) {
          onFilesSync(data.files);
        }

        if (!data.running) {
          if (rt.pollTimer) clearInterval(rt.pollTimer);
          rt.pollTimer = null;
          rt.running = false;
          setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, running: false } : t)));
          writePromptForTab(tabId);
        }
      } catch (err: any) {
        if (rt.pollTimer) clearInterval(rt.pollTimer);
        rt.pollTimer = null;
        rt.running = false;
        setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, running: false } : t)));
        if (rt.term) {
          rt.term.writeln(`\r\n\x1b[31mTerminal notice: ${err.message || "Process ended"}\x1b[0m`);
        }
        writePromptForTab(tabId);
      }
    }, 350);
  }, [onFilesSync, onOutputLog, onPreviewUrlChange, writePromptForTab]);

  const executeCommandOnTab = useCallback(async (tabId: string, cmd: string) => {
    const rt = runtimesRef.current.get(tabId);
    if (!rt) return;
    const term = rt.term;
    const tabObj = tabs.find((t) => t.id === tabId);
    const currentSessionId = tabObj?.sessionId || `sess_${roomId}_${tabId}_${Date.now()}`;

    if (cmd === "clear" || cmd === "cls") {
      term.clear();
      writePromptForTab(tabId);
      return;
    }

    if (cmd.startsWith("cd ")) {
      const target = cmd.slice(3).trim();
      rt.cwd = joinPath(rt.cwd, target);
      setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, cwd: rt.cwd } : t)));
      writePromptForTab(tabId);
      return;
    }

    rt.running = true;
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, running: true } : t)));

    try {
      const res = await fetch("/api/terminal", {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          action: "start",
          command: cmd,
          sessionId: currentSessionId,
          cwd: rt.cwd,
          files,
        }),
      });

      const data = await readJsonResponse(res);
      if (!res.ok || data.error) {
        throw new Error(data.error || `Command execution failed (${res.status})`);
      }
      pollSessionOutput(tabId, data.sessionId || currentSessionId);
    } catch (err: any) {
      term.writeln(`\r\n\x1b[31mError running command: ${err.message}\x1b[0m`);
      rt.running = false;
      setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, running: false } : t)));
      writePromptForTab(tabId);
    }
  }, [files, pollSessionOutput, roomId, tabs, writePromptForTab]);

  const initTerminalForTab = useCallback((tabId: string, container: HTMLDivElement) => {
    if (runtimesRef.current.has(tabId)) return;

    const term = new XTerm({
      theme: {
        background: "#0a0a0a",
        foreground: "#cccccc",
        cursor: "#ffffff",
        selectionBackground: "rgba(255,255,255,0.25)",
        black: "#000000",
        red: "#ef4444",
        green: "#22c55e",
        yellow: "#eab308",
        blue: "#3b82f6",
        magenta: "#a855f7",
        cyan: "#06b6d4",
        white: "#ffffff",
      },
      fontFamily: "Menlo, Monaco, 'Courier New', monospace",
      fontSize: 13,
      lineHeight: 1.25,
      cursorBlink: true,
      scrollback: 2000,
      convertEol: true,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    fit.fit();

    const rt: TabRuntime = {
      term,
      fit,
      pollTimer: null,
      inputBuffer: "",
      history: [],
      historyIndex: -1,
      running: false,
      cwd: "",
    };

    runtimesRef.current.set(tabId, rt);

    term.writeln("\x1b[1;37mCodeTogether Interactive Terminal\x1b[0m");
    term.writeln("\x1b[90mSupports bash, node, npm, python, git, curl, and custom scripts.\x1b[0m");
    term.write(getPrompt(""));

    term.onData((data) => {
      const currentRt = runtimesRef.current.get(tabId);
      if (!currentRt) return;

      if (currentRt.running) {
        // Handle Ctrl+C while running
        if (data === "\x03") {
          const tab = tabs.find((t) => t.id === tabId);
          if (tab) {
            sendSignalToBackend(tab.sessionId, "SIGINT");
          }
          currentRt.term.writeln("^C");
          return;
        }
        sendInputToBackend(tabs.find((t) => t.id === tabId)?.sessionId || "", data);
        return;
      }

      // Enter key
      if (data === "\r") {
        const cmd = currentRt.inputBuffer.trim();
        currentRt.term.writeln("");
        if (cmd) {
          currentRt.history.push(cmd);
          currentRt.historyIndex = currentRt.history.length;
          currentRt.inputBuffer = "";
          executeCommandOnTab(tabId, cmd);
        } else {
          writePromptForTab(tabId);
        }
        return;
      }

      // Backspace
      if (data === "\x7f" || data === "\b") {
        if (currentRt.inputBuffer.length > 0) {
          currentRt.inputBuffer = currentRt.inputBuffer.slice(0, -1);
          currentRt.term.write("\b \b");
        }
        return;
      }

      // Ctrl+C at prompt
      if (data === "\x03") {
        currentRt.term.writeln("^C");
        currentRt.inputBuffer = "";
        writePromptForTab(tabId);
        return;
      }

      // Ctrl+L (Clear screen)
      if (data === "\x0c") {
        currentRt.term.clear();
        writePromptForTab(tabId);
        if (currentRt.inputBuffer) {
          currentRt.term.write(currentRt.inputBuffer);
        }
        return;
      }

      // Ctrl+U (Clear line)
      if (data === "\x15") {
        while (currentRt.inputBuffer.length > 0) {
          currentRt.term.write("\b \b");
          currentRt.inputBuffer = currentRt.inputBuffer.slice(0, -1);
        }
        return;
      }

      // Arrow Up (History previous)
      if (data === "\x1b[A") {
        if (currentRt.history.length > 0 && currentRt.historyIndex > 0) {
          currentRt.historyIndex -= 1;
          const prevCmd = currentRt.history[currentRt.historyIndex] || "";
          while (currentRt.inputBuffer.length > 0) {
            currentRt.term.write("\b \b");
            currentRt.inputBuffer = currentRt.inputBuffer.slice(0, -1);
          }
          currentRt.inputBuffer = prevCmd;
          currentRt.term.write(prevCmd);
        }
        return;
      }

      // Arrow Down (History next)
      if (data === "\x1b[B") {
        if (currentRt.history.length > 0 && currentRt.historyIndex < currentRt.history.length) {
          currentRt.historyIndex += 1;
          const nextCmd = currentRt.historyIndex < currentRt.history.length ? currentRt.history[currentRt.historyIndex] : "";
          while (currentRt.inputBuffer.length > 0) {
            currentRt.term.write("\b \b");
            currentRt.inputBuffer = currentRt.inputBuffer.slice(0, -1);
          }
          currentRt.inputBuffer = nextCmd;
          currentRt.term.write(nextCmd);
        }
        return;
      }

      // Normal printable characters
      if (data >= " " || data === "\t") {
        currentRt.inputBuffer += data;
        currentRt.term.write(data);
      }
    });
  }, [executeCommandOnTab, getPrompt, tabs, writePromptForTab]);

  const addTab = () => {
    const num = nextTabNumRef.current++;
    const newId = `tab-${num}`;
    const newTab: TerminalTab = {
      id: newId,
      title: `${num}: bash`,
      sessionId: `sess_${roomId}_${num}_${Date.now()}`,
      running: false,
      cwd: "",
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
  };

  const closeTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const rt = runtimesRef.current.get(tabId);
    if (rt) {
      if (rt.pollTimer) clearInterval(rt.pollTimer);
      const tab = tabs.find((t) => t.id === tabId);
      if (tab) {
        fetch("/api/terminal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "stop", sessionId: tab.sessionId }),
        }).catch(() => {});
      }
      rt.term.dispose();
      runtimesRef.current.delete(tabId);
    }

    setTabs((prev) => {
      const filtered = prev.filter((t) => t.id !== tabId);
      if (filtered.length === 0) {
        const num = nextTabNumRef.current++;
        const fallback: TerminalTab = {
          id: `tab-${num}`,
          title: `${num}: bash`,
          sessionId: `sess_${roomId}_${num}_${Date.now()}`,
          running: false,
          cwd: "",
        };
        setActiveTabId(fallback.id);
        return [fallback];
      }
      if (activeTabId === tabId) {
        setActiveTabId(filtered[filtered.length - 1].id);
      }
      return filtered;
    });
  };

  const runCode = useCallback(async () => {
    const rt = runtimesRef.current.get(activeTabId);
    if (!rt) return;
    const term = rt.term;
    const activeTab = tabs.find((t) => t.id === activeTabId);
    const currentSessionId = activeTab?.sessionId || `sess_${roomId}_${activeTabId}_${Date.now()}`;

    const projectRoot = findProjectRoot(files, activeFileName);
    const targetCwd = projectRoot || rt.cwd;

    const currentCode = (codeRef && codeRef.current) || files.find((f) => (f.path || f.name) === activeFileName)?.content || "";

    rt.running = true;
    setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, running: true } : t)));

    term.writeln(`\r\n\x1b[1;36m▶ Running ${activeFileName || "script"}...\x1b[0m`);

    try {
      const res = await fetch("/api/terminal", {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          action: "start",
          code: currentCode,
          language,
          activeFileName,
          sessionId: currentSessionId,
          files,
          cwd: targetCwd,
        }),
      });

      const data = await readJsonResponse(res);
      if (!res.ok || data.error) {
        throw new Error(data.error || `Execution failed (${res.status})`);
      }
      pollSessionOutput(activeTabId, data.sessionId || currentSessionId);
    } catch (err: any) {
      term.writeln(`\x1b[31mExecution failed: ${err.message}\x1b[0m`);
      rt.running = false;
      setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, running: false } : t)));
      writePromptForTab(activeTabId);
    }
  }, [activeFileName, activeTabId, codeRef, files, language, pollSessionOutput, roomId, tabs, writePromptForTab]);

  const stopCode = async () => {
    const rt = runtimesRef.current.get(activeTabId);
    const activeTab = tabs.find((t) => t.id === activeTabId);
    if (activeTab) {
      sendSignalToBackend(activeTab.sessionId, "SIGTERM");
      try {
        await fetch("/api/terminal", {
          method: "POST",
          headers: await getAuthHeaders(),
          body: JSON.stringify({ action: "stop", sessionId: activeTab.sessionId }),
        });
      } catch {}
    }
    if (rt) {
      if (rt.pollTimer) clearInterval(rt.pollTimer);
      rt.pollTimer = null;
      rt.running = false;
      rt.term.writeln("\r\n\x1b[31m[Process terminated]\x1b[0m");
      writePromptForTab(activeTabId);
    }
    setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, running: false } : t)));
  };

  const executeScaffold = useCallback(async (cmd: string) => {
    setScaffoldOpen(false);
    const rt = runtimesRef.current.get(activeTabId);
    if (!rt) return;
    rt.term.writeln(`\r\n\x1b[1;35m⚡ Scaffolding project...\x1b[0m`);
    rt.term.writeln(`\x1b[90m$ ${cmd}\x1b[0m\r\n`);
    await executeCommandOnTab(activeTabId, cmd);
  }, [activeTabId, executeCommandOnTab]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      runtimesRef.current.forEach((rt) => {
        if (rt.pollTimer) clearInterval(rt.pollTimer);
        rt.term.dispose();
      });
      runtimesRef.current.clear();
    };
  }, []);

  useEffect(() => {
    tabs.forEach((tab) => {
      const el = containerRefs.current.get(tab.id);
      if (el && !runtimesRef.current.has(tab.id)) {
        initTerminalForTab(tab.id, el);
      }
    });
  }, [tabs, initTerminalForTab]);

  useEffect(() => {
    const rt = runtimesRef.current.get(activeTabId);
    if (rt) {
      setTimeout(() => {
        rt.fit.fit();
        rt.term.focus();
      }, 50);
    }
  }, [activeTabId]);

  useEffect(() => {
    const handleResize = () => {
      const rt = runtimesRef.current.get(activeTabId);
      if (rt) rt.fit.fit();
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [activeTabId]);

  useEffect(() => {
    if (triggerRun > 0 && triggerRun !== lastRunRef.current) {
      lastRunRef.current = triggerRun;
      runCode();
    }
  }, [triggerRun, runCode]);

  useEffect(() => {
    if (!scaffoldOpen) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-scaffold-dropdown]")) setScaffoldOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [scaffoldOpen]);

  const onDragStart = (e: React.MouseEvent) => {
    const startY = e.clientY;
    const startH = height;
    const onMove = (me: MouseEvent) => {
      const newH = Math.max(180, Math.min(window.innerHeight * 0.6, startH - (me.clientY - startY)));
      setHeight(newH);
      const rt = runtimesRef.current.get(activeTabId);
      if (rt) rt.fit.fit();
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    e.preventDefault();
  };

  const currentTabObj = tabs.find((t) => t.id === activeTabId);
  const isCurrentRunning = Boolean(currentTabObj?.running);

  return (
    <div
      style={{ height }}
      className="flex flex-col bg-[#0a0a0a] border-t border-[#2a2a2a] relative shrink-0 min-h-[180px] max-h-[60vh] text-gray-200"
    >
      {/* Resize handle */}
      <div onMouseDown={onDragStart} className="absolute -top-[3px] left-0 right-0 h-[6px] cursor-ns-resize z-10" />

      {/* Header with VS Code-like multi-terminal tabs */}
      <div className="h-[36px] flex items-center bg-[#141414] border-b border-[#2a2a2a] px-2.5 gap-2 shrink-0 select-none">
        {/* Terminal Tabs list */}
        <div className="flex items-center gap-1 flex-1 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={`group flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono cursor-pointer transition-colors border ${
                  isActive
                    ? "bg-[#202020] border-[#444] text-white"
                    : "bg-transparent border-transparent text-gray-400 hover:bg-[#1a1a1a] hover:text-gray-300"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    tab.running ? "bg-emerald-400 animate-pulse" : "bg-gray-500"
                  }`}
                />
                <TerminalIcon size={12} className="shrink-0 opacity-70" />
                <span className="truncate max-w-[90px]">{tab.title}</span>
                <button
                  onClick={(e) => closeTab(tab.id, e)}
                  title="Close terminal"
                  className="opacity-0 group-hover:opacity-100 hover:text-white p-0.5 rounded transition-opacity"
                >
                  <X size={11} />
                </button>
              </div>
            );
          })}

          <button
            onClick={addTab}
            title="New Terminal"
            className="flex items-center justify-center p-1 rounded hover:bg-[#252525] text-gray-400 hover:text-white transition-colors"
          >
            <Plus size={14} />
          </button>
        </div>

        {/* Right Action Controls */}
        <div className="flex gap-1.5 items-center relative">
          <div className="relative" data-scaffold-dropdown>
            <button
              onClick={() => setScaffoldOpen(!scaffoldOpen)}
              title="Quick scaffold project"
              className="flex items-center gap-1 px-2.5 py-1 bg-purple-500/20 border border-purple-500/40 rounded text-purple-300 cursor-pointer text-[11px] font-bold hover:bg-purple-500/30 transition-colors"
            >
              <Zap size={11} /> Scaffold <ChevronDown size={10} />
            </button>
            {scaffoldOpen && (
              <div className="absolute top-full right-0 mt-1 bg-[#1a1a2e] border border-[#333] rounded-lg shadow-2xl z-50 min-w-[240px] overflow-hidden">
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

          {isCurrentRunning ? (
            <button
              onClick={stopCode}
              title="Stop active command"
              className="flex items-center gap-1 px-2.5 py-1 bg-red-500/20 border border-red-500/40 rounded text-red-400 cursor-pointer text-[11px] font-bold hover:bg-red-500/30 transition-colors"
            >
              <Square size={11} /> Stop
            </button>
          ) : (
            <button
              onClick={runCode}
              title={`Run ${activeFileName || "current file"}`}
              className="flex items-center gap-1 px-2.5 py-1 bg-white border border-white rounded text-black cursor-pointer text-[11px] font-bold hover:bg-gray-200 transition-colors"
            >
              <Play size={11} fill="black" /> Run
            </button>
          )}

          <button
            onClick={() => runtimesRef.current.get(activeTabId)?.term.clear()}
            title="Clear terminal"
            className="p-[4px_8px] bg-transparent border-none text-gray-400 cursor-pointer rounded hover:text-white transition-colors"
          >
            <Trash2 size={13} />
          </button>

          <button
            onClick={onClose}
            title="Close panel"
            className="p-[4px_8px] bg-transparent border-none text-gray-400 cursor-pointer rounded hover:text-white transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Terminal Viewports for all tabs */}
      <div className="flex-1 relative overflow-hidden p-[4px_4px]">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            ref={(el) => {
              if (el) containerRefs.current.set(tab.id, el);
              else containerRefs.current.delete(tab.id);
            }}
            style={{ display: tab.id === activeTabId ? "block" : "none" }}
            className="w-full h-full"
          />
        ))}
      </div>
    </div>
  );
}
