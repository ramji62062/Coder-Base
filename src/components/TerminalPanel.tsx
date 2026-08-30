"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import { io, Socket } from "socket.io-client";
import {
  X, Trash2, Play, Square, Zap, ChevronDown, Plus,
  Terminal as TerminalIcon, ExternalLink, Laptop, ShieldCheck,
  Copy, Check, RefreshCw,
} from "lucide-react";
import type { FileItem } from "@/components/FileExplorer";
import { supabase } from "@/lib/supabase";
import { localAgentClient } from "@/lib/local-agent-client";

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

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
  onOutputLog?: (text: string) => void;
  terminalAction?: { type: "new" | "split" | "kill" | "clear"; timestamp: number } | null;
};

type TerminalTab = {
  id: string;
  title: string;
  terminalId: string;
  attached: boolean;
  cwd: string;
};

type TabRuntime = {
  term: XTerm;
  fit: FitAddon;
  webgl: WebglAddon | null;
  attached: boolean;
  cwd: string;
  transport: "server" | "direct-local";
  pendingInput: string[];
};

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function normalizePath(p: string) {
  return p.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
}

function extractLocalUrls(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\])(?::\d+)(?:\/[^\s"'`<>)]*)?/gi);
  if (!matches) return [];
  return Array.from(
    new Set(
      matches.map((url) =>
        url
          .replace(/[),.;]+$/g, "")
          .replace("0.0.0.0", "localhost")
          .replace("127.0.0.1", "localhost")
      )
    )
  );
}

function findProjectRoot(files: FileItem[], active: string) {
  const na = normalizePath(active);
  const cands = new Set<string>();
  if (na) cands.add(na);
  files.forEach((f) => {
    const p = normalizePath(f.path || f.name);
    if (p === "package.json" || p.endsWith("/package.json")) cands.add(p);
    if (p.endsWith("/vite.config.ts") || p.endsWith("/vite.config.js")) cands.add(p);
    if (p.endsWith("/next.config.js") || p.endsWith("/next.config.mjs")) cands.add(p);
  });
  for (const e of Array.from(cands)) {
    const n = normalizePath(e);
    if (n.endsWith("/package.json") || n.endsWith("/vite.config.ts") || n.endsWith("/vite.config.js") || n.endsWith("/next.config.mjs")) {
      const folder = n.split("/").slice(0, -1).join("/");
      if (folder) return folder;
    }
    if (["package.json", "vite.config.ts", "vite.config.js", "next.config.mjs"].includes(n)) return ".";
  }
  if (na) {
    const segs = na.split("/");
    for (let i = segs.length - 1; i > 0; i--) {
      const folder = segs.slice(0, i).join("/");
      if (files.some((f) => normalizePath(f.path || f.name) === `${folder}/package.json`)) return folder;
    }
  }
  return "";
}

async function readJson(res: Response) { const t = await res.text(); if (!t) return {}; try { return JSON.parse(t); } catch { return { output: t }; } }
async function getAuthToken() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || "dev-token";
  } catch {
    return "dev-token";
  }
}
async function getAuthHeaders() {
  const t = await getAuthToken();
  return { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}
function terminalWsUrl() {
  if (typeof window === "undefined") return "";
  const p = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${p}//${window.location.host}/ws/terminal`;
}

function canUseDirectLocalAgent() {
  if (typeof window === "undefined") return false;
  return window.location.protocol === "http:" || ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

// ─────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────

export default function TerminalPanel({
  onClose, roomId, codeRef, language, activeFileName,
  triggerRun = 0, files = [], onFilesSync, onOutputLog, terminalAction,
}: TerminalPanelProps) {

  // ── Layout ──
  const [height, setHeight] = useState(() => typeof window === "undefined" ? 280 : Math.min(360, Math.max(220, Math.round(window.innerHeight * 0.34))));

  // ── Terminal state ──
  const [tabs, setTabs] = useState<TerminalTab[]>(() => [{ id: "tab-1", title: "1: terminal", terminalId: `term_${roomId}_1`, attached: false, cwd: "" }]);
  const [activeTabId, setActiveTabId] = useState("tab-1");
  const [scaffoldOpen, setScaffoldOpen] = useState(false);
  const [connPhase, setConnPhase] = useState<"connecting" | "online" | "reconnecting">("connecting");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isLocalShell, setIsLocalShell] = useState(false);
  const [shellName, setShellName] = useState("");

  // ── Approach B: Local Agent / Protocol Launcher State ──
  const [showLocalModal, setShowLocalModal] = useState(false);
  const [agentConnecting, setAgentConnecting] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState(false);
  const [platformTab, setPlatformTab] = useState<"mac" | "linux" | "win">("mac");
  const [pairToken, setPairToken] = useState("");

  // ── Detected Localhost URLs ──
  const [detectedUrls, setDetectedUrls] = useState<string[]>([]);

  // ── Refs ──
  const containerRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const runtimesRef = useRef<Map<string, TabRuntime>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const nextTabNumRef = useRef(2);
  const lastRunRef = useRef(0);
  const lastActionRef = useRef(0);
  const mountedRef = useRef(true);
  const filesRef = useRef(files); filesRef.current = files;
  const tabsRef = useRef(tabs); tabsRef.current = tabs;

  const onOutputLogRef = useRef(onOutputLog); onOutputLogRef.current = onOutputLog;
  const onFilesSyncRef = useRef(onFilesSync); onFilesSyncRef.current = onFilesSync;

  const SCAFFOLD = [
    { label: "Vite + React (TS)", cmd: "npm create vite@latest my-app -- --template react-ts && cd my-app && npm install && npm pkg set scripts.dev=\"vite --host\" && npm run dev\n" },
    { label: "Vite + React (JS)", cmd: "npm create vite@latest my-app -- --template react && cd my-app && npm install && npm pkg set scripts.dev=\"vite --host\" && npm run dev\n" },
    { label: "Vite + Vue (TS)", cmd: "npm create vite@latest my-app -- --template vue-ts && cd my-app && npm install && npm pkg set scripts.dev=\"vite --host\" && npm run dev\n" },
    { label: "Vite + Svelte", cmd: "npm create vite@latest my-app -- --template svelte-ts && cd my-app && npm install && npm pkg set scripts.dev=\"vite --host\" && npm run dev\n" },
    { label: "Next.js App", cmd: "npx create-next-app@latest my-app --yes && cd my-app && npm pkg set scripts.dev=\"next dev -H 0.0.0.0 -p 5173\" && npm run dev\n" },
    { label: "Node (npm init)", cmd: "mkdir -p my-project && cd my-project && npm init -y\n" },
    { label: "Python HTTP Server", cmd: "python3 -m http.server 5173 --bind 0.0.0.0\n" },
  ];

  const getActiveTab = useCallback(() => tabs.find((t) => t.id === activeTabId), [tabs, activeTabId]);

  const isLocalShellRef = useRef(isLocalShell);
  isLocalShellRef.current = isLocalShell;

  // ── WebSocket helpers ──
  const sendWs = useCallback((obj: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify(obj)); return true; }
    return false;
  }, []);

  const sendInput = useCallback((tid: string, data: string) => {
    const tab = tabsRef.current.find((t) => t.terminalId === tid);
    const rt = tab ? runtimesRef.current.get(tab.id) : null;
    if (!rt?.attached) {
      if (rt && rt.pendingInput.length < 200) rt.pendingInput.push(data);
      return;
    }

    if (rt.transport === "direct-local") {
      if (!localAgentClient.sendInput(tid, data) && rt.pendingInput.length < 200) {
        rt.pendingInput.push(data);
      }
    } else {
      if (!sendWs({ type: "input", roomId, terminalId: tid, data }) && rt.pendingInput.length < 200) {
        rt.pendingInput.push(data);
      }
    }
  }, [roomId, sendWs]);

  const flushPendingInput = useCallback((terminalId: string) => {
    const tab = tabsRef.current.find((t) => t.terminalId === terminalId);
    const rt = tab ? runtimesRef.current.get(tab.id) : null;
    if (!rt || !rt.attached || rt.pendingInput.length === 0) return;
    const pending = rt.pendingInput.splice(0);
    for (const data of pending) {
      if (rt.transport === "direct-local") {
        localAgentClient.sendInput(terminalId, data);
      } else {
        sendWs({ type: "input", roomId, terminalId, data });
      }
    }
  }, [roomId, sendWs]);

  // ── Attach a tab to the terminal (Local Agent or Server PTY) ──
  const attachTerminal = useCallback(async (tabId: string, terminalId: string) => {
    const rt = runtimesRef.current.get(tabId);
    if (!rt) return;

    rt.fit.fit();
    rt.attached = false;
    (rt as any)._lastAttachTime = Date.now();
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, attached: false } : t)));

    // Route to Local Agent if connected
    if (canUseDirectLocalAgent() && localAgentClient.isConnected()) {
      rt.transport = "direct-local";
      localAgentClient.attachTerminal(terminalId, rt.term.cols, rt.term.rows);
      return;
    }

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const token = await getAuthToken();

    sendWs({
      type: "attach",
      token,
      roomId,
      terminalId,
      cols: rt.term.cols,
      rows: rt.term.rows,
      files: filesRef.current,
      mode: "local",
    });
  }, [roomId, sendWs]);

  // ── Approach B Launcher Handlers ──
  const handleLaunchProtocol = useCallback(async () => {
    setAgentConnecting(true);
    let freshPairToken = pairToken;
    try {
      const res = await fetch("/api/agent/pair", {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify({ roomId }),
      });
      const data = await readJson(res);
      if (data?.token) {
        freshPairToken = data.token;
        setPairToken(data.token);
      }
    } catch {}

    // 1. Immediate direct connect check (instant if agent is already running)
    if (canUseDirectLocalAgent()) {
      try {
        await localAgentClient.connect("ws://127.0.0.1:8765");
        if (localAgentClient.isConnected()) {
          setAgentConnecting(false);
          setShowLocalModal(false);
          setIsLocalShell(true);
          const info = localAgentClient.getAgentInfo();
          if (info?.shell) setShellName(info.shell.split("/").pop() || info.shell);
          for (const tab of tabsRef.current) {
            const rt = runtimesRef.current.get(tab.id);
            if (rt) {
              rt.attached = false;
              attachTerminal(tab.id, tab.terminalId);
            }
          }
          onOutputLogRef.current?.("[terminal] Successfully connected to personal local terminal via CodeTogether Agent");
          return;
        }
      } catch {}
    }

    // 2. Trigger OS protocol launch handler
    localAgentClient.triggerProtocolLaunch(roomId, 8765, "", freshPairToken);

    if (!canUseDirectLocalAgent()) {
      setTimeout(() => setAgentConnecting(false), 8000);
      return;
    }

    // 3. Fast poll for agent startup & connect
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        await localAgentClient.connect("ws://127.0.0.1:8765");
        if (localAgentClient.isConnected()) {
          clearInterval(interval);
          setAgentConnecting(false);
          setShowLocalModal(false);
          setIsLocalShell(true);
          const info = localAgentClient.getAgentInfo();
          if (info?.shell) setShellName(info.shell.split("/").pop() || info.shell);
          for (const tab of tabsRef.current) {
            const rt = runtimesRef.current.get(tab.id);
            if (rt) {
              rt.attached = false;
              attachTerminal(tab.id, tab.terminalId);
            }
          }
          onOutputLogRef.current?.("[terminal] Successfully connected to personal local terminal via CodeTogether Agent");
        }
      } catch {}

      if (attempts >= 20) {
        clearInterval(interval);
        setAgentConnecting(false);
      }
    }, 400);
  }, [attachTerminal, pairToken, roomId]);

  // ── Init xterm for a tab ──
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
      scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    fit.fit();

    let webgl: WebglAddon | null = null;
    try { webgl = new WebglAddon(); term.loadAddon(webgl); } catch { webgl = null; }

    const rt: TabRuntime = { term, fit, webgl, attached: false, cwd: "", transport: "server", pendingInput: [] };
    runtimesRef.current.set(tabId, rt);

    term.writeln("\x1b[1;37mCodeTogether Terminal\x1b[0m");
    term.writeln("\x1b[90mConnecting…\x1b[0m\r\n");

    term.onData((data) => {
      const tab = tabsRef.current.find((t) => t.id === tabId);
      if (tab) sendInput(tab.terminalId, data);
    });

    const tab = tabsRef.current.find((t) => t.id === tabId);
    if (tab) {
      if (isLocalShellRef.current && localAgentClient.isConnected()) {
        attachTerminal(tabId, tab.terminalId);
      } else if (wsRef.current?.readyState === WebSocket.OPEN) {
        attachTerminal(tabId, tab.terminalId);
      }
    }
  }, [attachTerminal, sendInput]);

  const resizeActive = useCallback(() => {
    const tab = getActiveTab();
    const rt = runtimesRef.current.get(activeTabId);
    if (!tab || !rt) return;
    rt.fit.fit();
    if (rt.attached) sendWs({ type: "resize", roomId, terminalId: tab.terminalId, cols: rt.term.cols, rows: rt.term.rows });
  }, [activeTabId, getActiveTab, roomId, sendWs]);

  // ── Save all modified files to workspace via /api/terminal ──
  const saveFilesToWorkspace = useCallback(async () => {
    try {
      const activeContent = (codeRef && codeRef.current) !== undefined ? codeRef.current : "";
      const currentFiles = filesRef.current || [];
      const updatedFiles = currentFiles.map((f) => {
        if (!f.isFolder && normalizePath(f.path || f.name) === normalizePath(activeFileName)) {
          return { ...f, content: activeContent };
        }
        return f;
      });
      if (activeFileName && !updatedFiles.some((f) => normalizePath(f.path || f.name) === normalizePath(activeFileName))) {
        updatedFiles.push({ name: activeFileName, path: activeFileName, content: activeContent, language });
      }
      await fetch("/api/terminal", {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify({ action: "sync-files", roomId, files: updatedFiles }),
      });
    } catch {}
  }, [activeFileName, codeRef, language, roomId]);

function computeRunCommand(lang: string, activePath: string, code: string): string {
  const norm = (activePath || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const base = norm.split("/").pop() || "main.js";
  const ext = base.split(".").pop()?.toLowerCase() || "";
  const target = norm || base;

  if (["js", "mjs", "cjs"].includes(ext) || lang === "javascript") {
    return `node "${target}"`;
  }
  if (["ts", "tsx"].includes(ext) || lang === "typescript") {
    return `npx tsx "${target}" 2>/dev/null || npx ts-node "${target}" 2>/dev/null || node "${target}"`;
  }
  if (["py", "py3"].includes(ext) || lang === "python") {
    return `python3 "${target}" 2>/dev/null || python "${target}"`;
  }
  if (ext === "java" || lang === "java") {
    const classMatch = code.match(/public\s+class\s+([A-Za-z0-9_$]+)/) || code.match(/\bclass\s+([A-Za-z0-9_$]+)/);
    const className = classMatch ? classMatch[1] : (base.replace(/\.java$/, "") || "Main");
    return `javac "${target}" && java ${className}`;
  }
  if (["cpp", "cc", "cxx"].includes(ext) || lang === "cpp") {
    return `g++ -std=c++17 "${target}" -o app && ./app`;
  }
  if (ext === "c" || lang === "c") {
    return `gcc "${target}" -o app && ./app`;
  }
  if (ext === "rs" || lang === "rust") {
    return `rustc "${target}" -o app && ./app`;
  }
  if (ext === "go" || lang === "go") {
    return `go run "${target}"`;
  }
  if (ext === "php" || lang === "php") {
    return `php "${target}"`;
  }
  if (ext === "rb" || lang === "ruby") {
    return `ruby "${target}"`;
  }
  if (["sh", "bash", "zsh"].includes(ext) || lang === "shell") {
    return `bash "${target}"`;
  }
  return `node "${target}"`;
}

  // ── Execute run command through PTY ──
  const executeRunCommand = useCallback(async () => {
    const rt = runtimesRef.current.get(activeTabId);
    const tab = getActiveTab();
    if (!rt || !tab || !rt.attached) return;

    const currentFiles = filesRef.current || [];
    const activeContent = (codeRef && codeRef.current) !== undefined ? codeRef.current : "";
    const updatedFiles = currentFiles.map((f) => {
      if (!f.isFolder && normalizePath(f.path || f.name) === normalizePath(activeFileName)) {
        return { ...f, content: activeContent };
      }
      return f;
    });
    if (activeFileName && !updatedFiles.some((f) => normalizePath(f.path || f.name) === normalizePath(activeFileName))) {
      updatedFiles.push({ name: activeFileName, path: activeFileName, content: activeContent, language });
    }

    const projectRoot = findProjectRoot(updatedFiles, activeFileName);
    const currentCode = activeContent || updatedFiles.find((f) => normalizePath(f.path || f.name) === normalizePath(activeFileName))?.content || "";

    // Save files first to workspace on disk
    void saveFilesToWorkspace();
    sendWs({ type: "sync-workspace", roomId, files: updatedFiles });

    // Determine run command
    rt.term.write(`\r\n\x1b[36m# Running ${activeFileName || "script"}\x1b[0m\r\n`);
    
    let execCmd = computeRunCommand(language, activeFileName, currentCode);
    try {
      const res = await fetch("/api/terminal", {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          action: "get-run-command",
          code: currentCode,
          language,
          activeFileName,
          cwd: projectRoot,
          roomId,
          files: updatedFiles,
        }),
      });
      const data = await readJson(res);
      if (data && data.execCmd) {
        execCmd = data.execCmd;
      }
    } catch {}

    const prefix = projectRoot && projectRoot !== "." ? `cd ${projectRoot} && ` : "";
    sendInput(tab.terminalId, `${prefix}${execCmd}\n`);
  }, [activeFileName, activeTabId, codeRef, getActiveTab, language, roomId, saveFilesToWorkspace, sendInput, sendWs]);

  // ── Main Run handler ──
  const runQuickCode = useCallback(async () => {
    const rt = runtimesRef.current.get(activeTabId);
    const tab = getActiveTab();
    if (!rt || !tab) return;

    const currentFiles = filesRef.current || [];
    const activeContent = (codeRef && codeRef.current) !== undefined ? codeRef.current : "";
    const currentCode = activeContent || currentFiles.find((f) => normalizePath(f.path || f.name) === normalizePath(activeFileName))?.content || "";
    const updatedFiles = currentFiles.map((f) => {
      if (!f.isFolder && normalizePath(f.path || f.name) === normalizePath(activeFileName)) {
        return { ...f, content: currentCode };
      }
      return f;
    });
    if (activeFileName && !updatedFiles.some((f) => normalizePath(f.path || f.name) === normalizePath(activeFileName))) {
      updatedFiles.push({ name: activeFileName, path: activeFileName, content: currentCode, language });
    }

    // 1. If a real terminal is attached, run through that PTY. In production
    // this goes through the Render reverse tunnel; in local dev it may go
    // directly to the localhost companion.
    if (rt.attached) {
      const projectRoot = findProjectRoot(updatedFiles, activeFileName);
      const execCmd = computeRunCommand(language, activeFileName, currentCode);
      const prefix = projectRoot && projectRoot !== "." ? `cd "${projectRoot}" && ` : "";
      rt.term.write(`\r\n\x1b[36m# Running: ${execCmd}\x1b[0m\r\n`);
      void saveFilesToWorkspace();
      sendWs({ type: "sync-workspace", roomId, files: updatedFiles });
      sendInput(tab.terminalId, `${prefix}${execCmd}\n`);
      return;
    }

    // 2. Fallback to Piston Execution Engine for 100% reliable execution everywhere!
    rt.term.write(`\r\n\x1b[1;36m▶ Running ${activeFileName || "code"} via Piston Execution Engine...\x1b[0m\r\n`);
    try {
      const res = await fetch("/api/run-code", {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          code: currentCode,
          language,
          fileName: activeFileName,
        }),
      });
      const data = await readJson(res);
      if (data) {
        if (data.stdout) {
          rt.term.write(data.stdout.replace(/\r?\n/g, "\r\n"));
        }
        if (data.stderr) {
          rt.term.write(`\x1b[31m${data.stderr.replace(/\r?\n/g, "\r\n")}\x1b[0m`);
        }
        const exitCode = data.exitCode ?? 0;
        const statusColor = exitCode === 0 ? "\x1b[32m" : "\x1b[31m";
        rt.term.write(`\r\n${statusColor}[Process exited with code ${exitCode}]\x1b[0m\r\n`);
      } else {
        rt.term.write(`\r\n\x1b[31m[Execution returned no response]\x1b[0m\r\n`);
      }
    } catch (err: any) {
      rt.term.write(`\r\n\x1b[31m[Execution Error: ${err.message}]\x1b[0m\r\n`);
    }
  }, [activeFileName, activeTabId, codeRef, getActiveTab, language, roomId, saveFilesToWorkspace, sendInput, sendWs]);

  const stopTerminal = useCallback(() => {
    const tab = getActiveTab();
    if (tab) sendInput(tab.terminalId, "\x03");
  }, [getActiveTab, sendInput]);

  // ── Tab management ──
  const addTab = () => {
    const num = nextTabNumRef.current++;
    const newTab: TerminalTab = { id: `tab-${num}`, title: `${num}: terminal`, terminalId: `term_${roomId}_${num}`, attached: false, cwd: "" };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  const closeTab = (tabId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const rt = runtimesRef.current.get(tabId);
    const tab = tabs.find((t) => t.id === tabId);
    if (tab) sendWs({ type: "kill", roomId, terminalId: tab.terminalId });
    if (rt) { rt.webgl?.dispose(); rt.term.dispose(); runtimesRef.current.delete(tabId); }
    setTabs((prev) => {
      const filtered = prev.filter((t) => t.id !== tabId);
      if (filtered.length === 0) {
        const num = nextTabNumRef.current++;
        const fb: TerminalTab = { id: `tab-${num}`, title: `${num}: terminal`, terminalId: `term_${roomId}_${num}`, attached: false, cwd: "" };
        setActiveTabId(fb.id); return [fb];
      }
      if (activeTabId === tabId) setActiveTabId(filtered[filtered.length - 1].id);
      return filtered;
    });
  };

  const executeScaffold = (cmd: string) => {
    setScaffoldOpen(false);
    const tab = getActiveTab();
    if (tab) sendInput(tab.terminalId, `\n${cmd}`);
  };

  // ── Socket.IO file-sync ──
  useEffect(() => {
    mountedRef.current = true;
    const socket = io({ path: "/api/socket", transports: ["websocket", "polling"], reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 600, reconnectionDelayMax: 5000, timeout: 15000 });
    socketRef.current = socket;
    socket.on("connect", () => socket.emit("terminal:join-room", { roomId }));
    socket.on("terminal:files-updated", (payload: { roomId?: string; files?: FileItem[] }) => {
      if (payload.roomId !== roomId || !payload.files) return;
      filesRef.current = payload.files;
      onFilesSync?.(payload.files);
    });
    socket.on("disconnect", () => socket.emit("terminal:leave-room", { roomId }));
    return () => { socket.emit("terminal:leave-room", { roomId }); socket.disconnect(); socketRef.current = null; };
  }, [roomId, onFilesSync]);

  // ── Local Agent Client Listeners & Auto-Probe ──
  useEffect(() => {
    localAgentClient.setListeners({
      onTerminalOutput: (tid, data) => {
        const tab = tabsRef.current.find((t) => t.terminalId === tid);
        const rt = tab ? runtimesRef.current.get(tab.id) : null;
        if (rt) {
          rt.term.write(data);
          onOutputLogRef.current?.(data);
          const foundUrls = extractLocalUrls(data);
          if (foundUrls.length > 0) {
            setDetectedUrls((prev) => Array.from(new Set([...prev, ...foundUrls])));
          }
        }
      },
      onTerminalExit: (tid, exitCode) => {
        const tab = tabsRef.current.find((t) => t.terminalId === tid);
        const rt = tab ? runtimesRef.current.get(tab.id) : null;
        if (rt) {
          rt.term.writeln(`\r\n\x1b[90m[Local process exited with code ${exitCode}]\x1b[0m`);
        }
      },
      onTerminalAttached: (tid) => {
        const tab = tabsRef.current.find((t) => t.terminalId === tid);
        const rt = tab ? runtimesRef.current.get(tab.id) : null;
        if (rt) {
          rt.attached = true;
          rt.transport = "direct-local";
          setTabs((prev) => prev.map((t) => (t.terminalId === tid ? { ...t, attached: true } : t)));
          flushPendingInput(tid);
        }
      },
      onFilesUpdated: (newFiles) => {
        filesRef.current = newFiles;
        onFilesSyncRef.current?.(newFiles);
      },
      onStatusChange: (status, info) => {
        if (status === "connected" && canUseDirectLocalAgent()) {
          setIsLocalShell(true);
          if (info?.shell) setShellName(info.shell.split("/").pop() || info.shell);
        } else if (status === "disconnected") {
          if (canUseDirectLocalAgent()) setIsLocalShell(false);
        }
      },
    });

    // Auto-probe if companion is already running locally on user's machine
    if (canUseDirectLocalAgent()) {
      localAgentClient.connect("ws://127.0.0.1:8765", "", 1200).then((info) => {
        if (info && mountedRef.current) {
          setIsLocalShell(true);
          if (info.shell) setShellName(info.shell.split("/").pop() || info.shell);
          for (const tab of tabsRef.current) {
            const rt = runtimesRef.current.get(tab.id);
            if (rt) {
              rt.attached = false;
              attachTerminal(tab.id, tab.terminalId);
            }
          }
        }
      }).catch(() => {});
    }
  }, [attachTerminal, flushPendingInput]);

  // ── Terminal WebSocket ──
  useEffect(() => {
    mountedRef.current = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closedByUs = false;

    const connect = () => {
      if (closedByUs || !mountedRef.current) return;
      const ws = new WebSocket(terminalWsUrl());
      wsRef.current = ws;
      setConnPhase("connecting");

      ws.onopen = () => {
        if (!mountedRef.current) { ws.close(); return; }
        setConnPhase("online");
        setConnectionError(null);
        for (const tab of tabsRef.current) {
          const rt = runtimesRef.current.get(tab.id);
          if (rt) attachTerminal(tab.id, tab.terminalId);
        }
      };

      ws.onmessage = (ev) => {
        let msg: any;
        try { msg = JSON.parse(ev.data as string); } catch { return; }
        if (msg.roomId && msg.roomId !== roomId) return;

        switch (msg.type) {
          case "attached":
            if (!msg.ok) {
              setConnectionError(msg.error || "Failed to attach.");
              return;
            }
            setConnectionError(null);
            setIsLocalShell(Boolean(msg.isLocal));
            if (msg.shell) setShellName(msg.shell);
            setTabs((prev) => prev.map((t) => (t.terminalId === msg.terminalId ? { ...t, attached: true } : t)));
            runtimesRef.current.forEach((r, id) => {
              const tab = tabsRef.current.find((t) => t.id === id);
              if (tab?.terminalId === msg.terminalId) {
                r.attached = true;
                r.transport = "server";
              }
            });
            flushPendingInput(msg.terminalId);
            break;
          case "agent:connected": {
            setIsLocalShell(true);
            if (msg.shell) setShellName(msg.shell.split("/").pop() || msg.shell);
            onOutputLogRef.current?.("\r\n[tunnel] Local companion terminal connected to room");
            for (const tab of tabsRef.current) {
              const rt = runtimesRef.current.get(tab.id);
              if (rt) {
                rt.attached = false;
                attachTerminal(tab.id, tab.terminalId);
              }
            }
            break;
          }
          case "agent:disconnected": {
            setIsLocalShell(false);
            onOutputLogRef.current?.("\r\n[tunnel] Local companion terminal disconnected");
            break;
          }
          case "output": {
            const tab = tabsRef.current.find((t) => t.terminalId === msg.terminalId);
            const rt = tab ? runtimesRef.current.get(tab.id) : null;
            if (rt) {
              rt.term.write(msg.data);
              onOutputLogRef.current?.(msg.data);
              const foundUrls = extractLocalUrls(msg.data);
              if (foundUrls.length > 0) {
                setDetectedUrls((prev) => Array.from(new Set([...prev, ...foundUrls])));
              }
            }
            break;
          }
          case "exit": {
            const tab = tabsRef.current.find((t) => t.terminalId === msg.terminalId);
            if (!tab) break;
            const rt = runtimesRef.current.get(tab.id);

            // Track rapid exits to prevent infinite reconnect loops
            // If the shell exits within 2 seconds of attach, it's a spawn failure
            const now = Date.now();
            const lastAttach = (rt as any)?._lastAttachTime || 0;
            const rapidExit = now - lastAttach < 2000;
            const prevFails = ((rt as any)?._rapidExitCount || 0);
            const rapidExitCount = rapidExit ? prevFails + 1 : 0;

            if (rt) {
              (rt as any)._rapidExitCount = rapidExitCount;
            }

            if (rapidExitCount >= 3) {
              // Stop retrying — server can't spawn a shell
              rt?.term.writeln("\r\n\x1b[31m[Shell failed to start on the server]\x1b[0m");
              rt?.term.writeln("\x1b[33mThe server environment does not have a compatible shell.\x1b[0m");
              rt?.term.writeln("\x1b[33mUse the \"Local Terminal\" tab instead — click the Launch button to connect your own terminal.\x1b[0m");
              rt?.term.writeln("\x1b[90m(Automatic reconnect stopped after 3 failed attempts)\x1b[0m");
              if (rt) rt.attached = false;
              setTabs((prev) => prev.map((t) => (t.id === tab.id ? { ...t, attached: false } : t)));
              break;
            }

            rt?.term.writeln("\r\n\x1b[90m[Shell exited — reconnecting…]\x1b[0m");
            if (rt) rt.attached = false;
            setTabs((prev) => prev.map((t) => (t.id === tab.id ? { ...t, attached: false } : t)));
            const delay = rapidExit ? Math.min(1000 * Math.pow(2, rapidExitCount), 5000) : 600;
            setTimeout(() => { if (mountedRef.current) attachTerminal(tab.id, tab.terminalId); }, delay);
            break;
          }
        }
      };

      ws.onclose = () => {
        setConnPhase("reconnecting");
        if (!closedByUs && mountedRef.current) reconnectTimer = setTimeout(connect, 1000);
      };
      ws.onerror = () => {};
    };
    connect();

    return () => {
      closedByUs = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      mountedRef.current = false;
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
    };
  }, [roomId, attachTerminal, flushPendingInput]);

  // Tab init
  useEffect(() => {
    tabs.forEach((tab) => {
      const el = containerRefs.current.get(tab.id);
      if (el && !runtimesRef.current.has(tab.id)) initTerminalForTab(tab.id, el);
      else if (el && runtimesRef.current.has(tab.id) && !runtimesRef.current.get(tab.id)!.attached && wsRef.current?.readyState === WebSocket.OPEN) {
        attachTerminal(tab.id, tab.terminalId);
      }
    });
  }, [tabs, initTerminalForTab, attachTerminal]);

  useEffect(() => {
    const rt = runtimesRef.current.get(activeTabId);
    if (rt) setTimeout(() => { rt.fit.fit(); rt.term.focus(); resizeActive(); }, 50);
  }, [activeTabId, resizeActive]);

  useEffect(() => {
    const h = () => resizeActive();
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [resizeActive]);

  useEffect(() => {
    if (triggerRun > 0 && triggerRun !== lastRunRef.current) {
      lastRunRef.current = triggerRun;
      runQuickCode();
    }
  }, [triggerRun, runQuickCode]);

  useEffect(() => {
    if (terminalAction && terminalAction.timestamp !== lastActionRef.current) {
      lastActionRef.current = terminalAction.timestamp;
      if (terminalAction.type === "new" || terminalAction.type === "split") {
        addTab();
      } else if (terminalAction.type === "kill") {
        closeTab(activeTabId);
      } else if (terminalAction.type === "clear") {
        runtimesRef.current.get(activeTabId)?.term.clear();
      }
    }
  }, [terminalAction, addTab, closeTab, activeTabId]);

  useEffect(() => {
    if (!scaffoldOpen) return;
    const h = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-scaffold-dropdown]")) setScaffoldOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [scaffoldOpen]);

  useEffect(() => {
    if (!showLocalModal) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/agent/pair", {
          method: "POST",
          headers: await getAuthHeaders(),
          body: JSON.stringify({ roomId }),
        });
        const data = await readJson(res);
        if (!cancelled && data?.token) setPairToken(data.token);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [roomId, showLocalModal]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      runtimesRef.current.forEach((rt) => { rt.webgl?.dispose(); rt.term.dispose(); });
      runtimesRef.current.clear();
    };
  }, []);

  const onDragStart = (e: React.MouseEvent) => {
    const startY = e.clientY;
    const startH = height;
    const onMove = (me: MouseEvent) => {
      setHeight(Math.max(180, Math.min(window.innerHeight * 0.6, startH - (me.clientY - startY))));
      resizeActive();
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    e.preventDefault();
  };

  // ─────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ height }} className="flex flex-col bg-[#0a0a0a] border-t border-[#2a2a2a] relative shrink-0 min-h-[180px] max-h-[60vh] text-gray-200">
      <div onMouseDown={onDragStart} className="absolute -top-[3px] left-0 right-0 h-[6px] cursor-ns-resize z-10" />

      {/* Status banner (only when reconnecting or error) */}
      {(connPhase !== "online" || connectionError) && (
        <div className="shrink-0 flex items-center justify-between gap-3 px-3 py-1.5 text-xs border-b border-[#2a2a2a]" style={{ background: connectionError ? "#3b1010" : "#10203b" }}>
          <span className="flex items-center gap-2">
            {connectionError ? (
              <><span>⚠️</span><span className="text-red-300 font-semibold">{connectionError}</span></>
            ) : (
              <><span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse inline-block" /><span className="text-sky-200 font-medium">{connPhase === "connecting" ? "Connecting to terminal…" : "Reconnecting…"}</span></>
            )}
          </span>
          {connectionError && (
            <button
              onClick={() => {
                setConnectionError(null);
                const tab = getActiveTab();
                if (tab) {
                  const rt = runtimesRef.current.get(tab.id);
                  if (rt) rt.attached = false;
                  attachTerminal(tab.id, tab.terminalId);
                }
              }}
              className="px-2.5 py-1 rounded bg-[#ffffff22] border border-[#ffffff55] text-white font-semibold hover:bg-[#ffffff33] cursor-pointer"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Controls Bar */}
      <div className="h-[36px] flex items-center bg-[#141414] border-b border-[#2a2a2a] px-2.5 gap-2 shrink-0 select-none">

        {/* Shell badge */}
        {isLocalShell && shellName && (
          <div className="flex items-center gap-1.5 bg-emerald-950/70 border border-emerald-700/60 rounded px-2 py-0.5 mr-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-[11px] font-mono text-emerald-300 font-medium">{shellName.split("/").pop()}</span>
          </div>
        )}

        {/* Local / Cloud Bridge toggle */}
        <button
          onClick={() => setShowLocalModal(true)}
          title="Connect Personal Local Terminal"
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium transition-colors border cursor-pointer ${
            isLocalShell
              ? "bg-emerald-950/70 border-emerald-700/60 text-emerald-300 hover:bg-emerald-900/80"
              : "bg-[#1c1c24] border-[#333] text-gray-300 hover:bg-[#252532] hover:text-white"
          }`}
        >
          <Laptop size={12} className={isLocalShell ? "text-emerald-400" : "text-sky-400"} />
          <span>{isLocalShell ? "Local Terminal" : "Connect Local"}</span>
        </button>

        {/* Tabs */}
        <div className="flex items-center gap-1 flex-1 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={`group flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono cursor-pointer transition-colors border ${
                tab.id === activeTabId ? "bg-[#202020] border-[#444] text-white" : "bg-transparent border-transparent text-gray-400 hover:bg-[#1a1a1a] hover:text-gray-300"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tab.attached ? "bg-emerald-400" : "bg-sky-400 animate-pulse"}`} />
              <TerminalIcon size={12} className="shrink-0 opacity-70" />
              <span className="truncate max-w-[90px]">{tab.title}</span>
              <button onClick={(e) => closeTab(tab.id, e)} title="Close" className="opacity-0 group-hover:opacity-100 hover:text-white p-0.5 rounded transition-opacity"><X size={11} /></button>
            </div>
          ))}
          <button onClick={addTab} title="New Terminal" className="flex items-center justify-center p-1 rounded hover:bg-[#252525] text-gray-400 hover:text-white transition-colors cursor-pointer"><Plus size={14} /></button>
        </div>

        {/* Detected Localhost Server Links (VS Code style) */}
        {detectedUrls.length > 0 && (
          <div className="flex items-center gap-1.5 shrink-0">
            {detectedUrls.map((url) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                title={`Open ${url} in browser`}
                className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-sky-500/15 border border-sky-400/40 text-sky-300 hover:bg-sky-500/25 hover:text-white text-[11px] font-mono transition-colors"
              >
                <ExternalLink size={11} className="text-sky-400" />
                <span className="max-w-[120px] truncate">{url.replace(/^https?:\/\//, "")}</span>
                <span className="text-[10px] bg-sky-400/20 px-1 rounded text-sky-200 font-sans font-semibold">Open ↗</span>
              </a>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-1.5 items-center relative shrink-0">
          <div className="relative" data-scaffold-dropdown>
            <button onClick={() => setScaffoldOpen(!scaffoldOpen)} title="Scaffold" className="flex items-center gap-1 px-2.5 py-1 bg-purple-500/20 border border-purple-500/40 rounded text-purple-300 cursor-pointer text-[11px] font-bold hover:bg-purple-500/30 transition-colors">
              <Zap size={11} /> Scaffold <ChevronDown size={10} />
            </button>
            {scaffoldOpen && (
              <div className="absolute top-full right-0 mt-1 bg-[#1a1a2e] border border-[#333] rounded-lg shadow-2xl z-50 min-w-[240px] overflow-hidden">
                {SCAFFOLD.map((t) => (
                  <button key={t.label} onClick={() => executeScaffold(t.cmd)} className="w-full text-left px-3 py-2 text-[11px] text-gray-200 hover:bg-purple-500/20 cursor-pointer border-none bg-transparent transition-colors flex items-center gap-2">
                    <Zap size={10} className="text-purple-400 shrink-0" /> {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={runQuickCode} title={`Run ${activeFileName || "file"}`} className="flex items-center gap-1 px-2.5 py-1 bg-white border border-white rounded text-black cursor-pointer text-[11px] font-bold hover:bg-gray-200 transition-colors"><Play size={11} fill="black" /> Run</button>
          <button onClick={stopTerminal} title="Ctrl+C" className="flex items-center gap-1 px-2.5 py-1 bg-red-500/20 border border-red-500/40 rounded text-red-400 cursor-pointer text-[11px] font-bold hover:bg-red-500/30 transition-colors"><Square size={11} /> Stop</button>
          <button onClick={() => runtimesRef.current.get(activeTabId)?.term.clear()} title="Clear" className="p-[4px_8px] bg-transparent border-none text-gray-400 cursor-pointer rounded hover:text-white transition-colors"><Trash2 size={13} /></button>
          <button onClick={onClose} title="Close panel" className="p-[4px_8px] bg-transparent border-none text-gray-400 cursor-pointer rounded hover:text-white transition-colors"><X size={14} /></button>
        </div>
      </div>

      {/* Terminal viewport */}
      <div className="flex-1 relative overflow-hidden p-[4px_4px]">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            ref={(el) => { if (el) containerRefs.current.set(tab.id, el); else containerRefs.current.delete(tab.id); }}
            style={{ display: tab.id === activeTabId ? "block" : "none" }}
            className="w-full h-full"
          />
        ))}
      </div>

      {/* ── 1-Click Protocol Launcher Modal (Approach B) ── */}
      {showLocalModal && (
        <div className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#18181b] border border-[#3f3f46] rounded-xl shadow-2xl max-w-md w-full overflow-hidden text-gray-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#27272a] bg-[#121214]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
                  <Laptop size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Connect Personal Terminal</h3>
                  <p className="text-[11px] text-gray-400">1-Click Local Protocol Launcher</p>
                </div>
              </div>
              <button onClick={() => setShowLocalModal(false)} className="text-gray-400 hover:text-white p-1 rounded transition-colors cursor-pointer"><X size={16} /></button>
            </div>

            <div className="p-5 space-y-4 text-xs text-gray-300 leading-relaxed">
              <p>
                Connect your personal terminal directly to this collaborative session via the local agent or <span className="font-mono text-sky-300">codetogether://</span> protocol launcher.
              </p>

              {/* 1-Click Launch Button (Above OS Commands) */}
              <div className="space-y-1.5">
                <button
                  onClick={handleLaunchProtocol}
                  disabled={agentConnecting}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-sky-900/30 transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                >
                  {agentConnecting ? <RefreshCw size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
                  {agentConnecting ? "Connecting directly to local terminal…" : "🚀 Launch & Connect Local Terminal"}
                </button>
                <p className="text-[10px] text-center text-gray-400">
                  Instant direct connection if companion is already running.
                </p>
              </div>

              {/* First Time Setup Helper (Below Launch) */}
              <div className="pt-3 border-t border-[#27272a]">
                <p className="text-[11px] text-gray-400 mb-2">
                  First time? Select your OS, run this 1-line setup command, then click <strong>Launch</strong> above:
                </p>

                {/* OS Selector Tabs */}
                <div className="flex gap-1 mb-2">
                  {[
                    { id: "mac" as const, label: "macOS (Apple / Intel)" },
                    { id: "linux" as const, label: "Linux (Bash / Zsh)" },
                    { id: "win" as const, label: "Windows (PowerShell)" },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setPlatformTab(tab.id)}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                        platformTab === tab.id
                          ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                          : "text-gray-400 hover:text-gray-200 bg-[#27272a]/50 hover:bg-[#27272a] border border-transparent"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {(() => {
                  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
                  const pairParam = pairToken ? `&pairToken=${encodeURIComponent(pairToken)}` : "";
                  let cmd = `curl -fsSL "${origin}/api/agent/install?room=${roomId}${pairParam}" | bash`;
                  if (platformTab === "win") {
                    cmd = `irm "${origin}/api/agent/install?os=win&room=${roomId}${pairParam}" | iex`;
                  }

                  return (
                    <div className="flex items-center justify-between bg-[#101014] border border-[#27272a] rounded px-3 py-2 font-mono text-[11px] text-sky-200">
                      <span className="truncate mr-2 select-all">{cmd}</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(cmd);
                          setCopiedCommand(true);
                          setTimeout(() => setCopiedCommand(false), 2000);
                        }}
                        title="Copy command"
                        className="p-1.5 rounded bg-[#27272a] hover:bg-[#3f3f46] text-gray-200 transition-colors cursor-pointer shrink-0 flex items-center gap-1 text-[10px]"
                      >
                        {copiedCommand ? (
                          <>
                            <Check size={12} className="text-emerald-400" />
                            <span className="text-emerald-400 font-sans">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy size={12} />
                            <span className="font-sans">Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="flex items-center justify-end px-5 py-3 border-t border-[#27272a] bg-[#121214]">
              <button
                onClick={() => setShowLocalModal(false)}
                className="px-3 py-1.5 rounded-lg border border-[#3f3f46] text-gray-300 hover:text-white hover:bg-[#27272a] text-xs font-medium transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
