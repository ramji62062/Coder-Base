/**
 * CodeTogether Local Agent Client
 * Manages WebSocket connection, live PTY terminal streams, and file sync
 * directly with the CodeTogether Local Agent running on the user's computer.
 */

import type { FileItem } from "@/components/FileExplorer";

export type LocalAgentStatus = "disconnected" | "connecting" | "connected" | "error";

export type LocalAgentInfo = {
  workspace: string;
  platform: string;
  shell: string;
  hasNodePty: boolean;
};

export type SaveFileResult = {
  ok: boolean;
  mtimeMs?: number;
  size?: number;
  conflict?: boolean;
  diskContent?: string;
  diskMtime?: number;
  error?: string;
  message?: string;
};

export type LocalAgentListeners = {
  onStatusChange?: (status: LocalAgentStatus, info?: LocalAgentInfo | null, error?: string | null) => void;
  onTerminalOutput?: (terminalId: string, data: string) => void;
  onTerminalExit?: (terminalId: string, exitCode: number) => void;
  onFilesUpdated?: (files: FileItem[]) => void;
  onConflict?: (conflict: { path: string; diskContent: string; diskMtime: number; message: string }) => void;
};

const DEFAULT_AGENT_URL = "ws://127.0.0.1:8765";
const STORAGE_KEY_URL = "ct_local_agent_url";
const STORAGE_KEY_TOKEN = "ct_local_agent_token";

export class LocalAgentClient {
  private static instance: LocalAgentClient | null = null;
  private ws: WebSocket | null = null;
  private status: LocalAgentStatus = "disconnected";
  private agentInfo: LocalAgentInfo | null = null;
  private currentUrl = DEFAULT_AGENT_URL;
  private currentToken = "";
  private listeners: LocalAgentListeners = {};
  private pendingFileRequests: Map<string, { resolve: (val: any) => void; reject: (err: any) => void }> = new Map();
  private attachedTerminals: Set<string> = new Set();
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = false;

  private constructor() {
    if (typeof window !== "undefined") {
      this.currentUrl = localStorage.getItem(STORAGE_KEY_URL) || DEFAULT_AGENT_URL;
      this.currentToken = localStorage.getItem(STORAGE_KEY_TOKEN) || "";
    }
  }

  public static getInstance(): LocalAgentClient {
    if (!LocalAgentClient.instance) {
      LocalAgentClient.instance = new LocalAgentClient();
    }
    return LocalAgentClient.instance;
  }

  public getSavedUrl(): string {
    return this.currentUrl;
  }

  public getSavedToken(): string {
    return this.currentToken;
  }

  public getStatus(): LocalAgentStatus {
    return this.status;
  }

  public getAgentInfo(): LocalAgentInfo | null {
    return this.agentInfo;
  }

  public isConnected(): boolean {
    return this.status === "connected" && this.ws?.readyState === WebSocket.OPEN;
  }

  public setListeners(listeners: LocalAgentListeners) {
    this.listeners = { ...this.listeners, ...listeners };
  }

  public connect(url = this.currentUrl, token = this.currentToken, timeoutMs = 5000): Promise<LocalAgentInfo> {
    this.currentUrl = url || DEFAULT_AGENT_URL;
    this.currentToken = token || "";
    this.shouldReconnect = true;

    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_URL, this.currentUrl);
      if (this.currentToken) localStorage.setItem(STORAGE_KEY_TOKEN, this.currentToken);
    }

    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }

    this.updateStatus("connecting");

    return new Promise((resolve, reject) => {
      let isResolved = false;
      let wsUrl = this.currentUrl;
      if (this.currentToken) {
        const hasQuery = wsUrl.includes("?");
        wsUrl += `${hasQuery ? "&" : "?"}token=${encodeURIComponent(this.currentToken)}`;
      }

      try {
        const ws = new WebSocket(wsUrl);
        this.ws = ws;

        const timeout = setTimeout(() => {
          if (!isResolved && this.status === "connecting") {
            isResolved = true;
            this.updateStatus("error", null, "Connection timed out. Ensure the local agent is running.");
            try { ws.close(); } catch {}
            reject(new Error("Connection timed out."));
          }
        }, timeoutMs);

        ws.onopen = () => {
          ws.send(JSON.stringify({ type: "auth", token: this.currentToken || "" }));
        };

        ws.onmessage = (event) => {
          let msg: any;
          try {
            msg = JSON.parse(event.data as string);
          } catch {
            return;
          }

          if (!msg || typeof msg.type !== "string") return;

          switch (msg.type) {
            case "auth:ok": {
              clearTimeout(timeout);
              const info: LocalAgentInfo = {
                workspace: msg.workspace,
                platform: msg.platform,
                shell: msg.shell,
                hasNodePty: Boolean(msg.hasNodePty),
              };
              this.agentInfo = info;
              this.updateStatus("connected", info);
              this.startHeartbeat();

              if (!isResolved) {
                isResolved = true;
                resolve(info);
              }

              if (Array.isArray(msg.files) && this.listeners.onFilesUpdated) {
                this.listeners.onFilesUpdated(msg.files);
              }
              break;
            }

            case "auth:error": {
              clearTimeout(timeout);
              this.updateStatus("error", null, msg.error || "Authentication failed.");
              if (!isResolved) {
                isResolved = true;
                reject(new Error(msg.error || "Authentication failed."));
              }
              break;
            }

            case "output": {
              this.listeners.onTerminalOutput?.(msg.terminalId, msg.data);
              break;
            }

            case "exit": {
              this.listeners.onTerminalExit?.(msg.terminalId, msg.exitCode);
              break;
            }

            case "file:change": {
              if (Array.isArray(msg.files)) {
                this.listeners.onFilesUpdated?.(msg.files);
              }
              break;
            }

            case "file:write:ok": {
              const req = this.pendingFileRequests.get(`write:${msg.path}`);
              if (req) {
                req.resolve({ ok: true, mtimeMs: msg.mtimeMs, size: msg.size });
                this.pendingFileRequests.delete(`write:${msg.path}`);
              }
              break;
            }

            case "file:write:conflict": {
              const req = this.pendingFileRequests.get(`write:${msg.path}`);
              const conflict = {
                ok: false,
                conflict: true,
                path: msg.path,
                diskContent: msg.diskContent,
                diskMtime: msg.diskMtime,
                message: msg.message,
              };
              if (req) {
                req.resolve(conflict);
                this.pendingFileRequests.delete(`write:${msg.path}`);
              }
              this.listeners.onConflict?.(conflict);
              break;
            }

            case "file:write:error": {
              const req = this.pendingFileRequests.get(`write:${msg.path}`);
              if (req) {
                req.resolve({ ok: false, error: msg.error });
                this.pendingFileRequests.delete(`write:${msg.path}`);
              }
              break;
            }

            case "file:list:ok": {
              const req = this.pendingFileRequests.get("list");
              if (req) {
                req.resolve(msg.files);
                this.pendingFileRequests.delete("list");
              }
              if (Array.isArray(msg.files)) {
                this.listeners.onFilesUpdated?.(msg.files);
              }
              break;
            }

            case "file:read:ok": {
              const req = this.pendingFileRequests.get(`read:${msg.path}`);
              if (req) {
                req.resolve({ content: msg.content, mtimeMs: msg.mtimeMs, size: msg.size });
                this.pendingFileRequests.delete(`read:${msg.path}`);
              }
              break;
            }

            case "file:read:error": {
              const req = this.pendingFileRequests.get(`read:${msg.path}`);
              if (req) {
                req.reject(new Error(msg.error || "Read error"));
                this.pendingFileRequests.delete(`read:${msg.path}`);
              }
              break;
            }

            default:
              break;
          }
        };

        ws.onclose = (ev) => {
          this.stopHeartbeat();
          if (this.status !== "error") {
            this.updateStatus("disconnected");
          }
          if (this.shouldReconnect && ev.code !== 4001) {
            this.scheduleReconnect();
          }
        };

        ws.onerror = () => {
          if (!isResolved) {
            clearTimeout(timeout);
            isResolved = true;
            this.updateStatus("error", null, "Failed to connect to local agent on " + this.currentUrl);
            reject(new Error("Unable to connect to local agent."));
          }
        };
      } catch (err: any) {
        this.updateStatus("error", null, err.message);
        reject(err);
      }
    });
  }

  public disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.stopHeartbeat();
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    this.attachedTerminals.clear();
    this.agentInfo = null;
    this.updateStatus("disconnected");
  }

  // ── Terminal Methods ──
  public attachTerminal(terminalId: string, cols = 80, rows = 24): boolean {
    if (!this.isConnected()) return false;
    this.attachedTerminals.add(terminalId);
    this.send({ type: "attach", terminalId, cols, rows });
    return true;
  }

  public sendInput(terminalId: string, data: string): boolean {
    if (!this.isConnected()) return false;
    this.send({ type: "input", terminalId, data });
    return true;
  }

  public resizeTerminal(terminalId: string, cols: number, rows: number): boolean {
    if (!this.isConnected()) return false;
    this.send({ type: "resize", terminalId, cols, rows });
    return true;
  }

  public killTerminal(terminalId: string): boolean {
    if (!this.isConnected()) return false;
    this.attachedTerminals.delete(terminalId);
    this.send({ type: "kill", terminalId });
    return true;
  }

  // ── File Methods ──
  public saveFile(path: string, content: string, lastMtime?: number): Promise<SaveFileResult> {
    if (!this.isConnected()) {
      return Promise.resolve({ ok: false, error: "Local agent is not connected." });
    }

    return new Promise((resolve) => {
      const key = `write:${path}`;
      this.pendingFileRequests.set(key, {
        resolve,
        reject: (err) => resolve({ ok: false, error: err?.message || String(err) }),
      });
      this.send({ type: "file:write", path, content, lastMtime });

      // Fallback timeout
      setTimeout(() => {
        if (this.pendingFileRequests.has(key)) {
          this.pendingFileRequests.delete(key);
          resolve({ ok: false, error: "Save timed out." });
        }
      }, 8000);
    });
  }

  public readFile(path: string): Promise<{ content: string; mtimeMs: number; size: number }> {
    if (!this.isConnected()) {
      return Promise.reject(new Error("Local agent is not connected."));
    }

    return new Promise((resolve, reject) => {
      const key = `read:${path}`;
      this.pendingFileRequests.set(key, { resolve, reject });
      this.send({ type: "file:read", path });

      setTimeout(() => {
        if (this.pendingFileRequests.has(key)) {
          this.pendingFileRequests.delete(key);
          reject(new Error("Read timed out."));
        }
      }, 8000);
    });
  }

  public listFiles(): Promise<FileItem[]> {
    if (!this.isConnected()) {
      return Promise.reject(new Error("Local agent is not connected."));
    }

    return new Promise((resolve, reject) => {
      const key = "list";
      this.pendingFileRequests.set(key, { resolve, reject });
      this.send({ type: "file:list" });

      setTimeout(() => {
        if (this.pendingFileRequests.has(key)) {
          this.pendingFileRequests.delete(key);
          reject(new Error("List files timed out."));
        }
      }, 8000);
    });
  }

  private send(obj: Record<string, unknown>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(obj));
      } catch {}
    }
  }

  private updateStatus(status: LocalAgentStatus, info: LocalAgentInfo | null = this.agentInfo, error?: string | null) {
    this.status = status;
    if (status === "connected" && info) this.agentInfo = info;
    if (status === "disconnected") this.agentInfo = null;
    this.listeners.onStatusChange?.(status, this.agentInfo, error);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.isConnected()) {
        this.send({ type: "ping" });
      }
    }, 15000);
  }

  private stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) return;
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      if (this.shouldReconnect && this.status !== "connected") {
        this.connect().catch(() => {});
      }
    }, 3000);
  }

  public triggerProtocolLaunch(roomId: string, port = 8765, token = "") {
    if (typeof window === "undefined") return;
    const launchUrl = `codetogether://connect?roomId=${encodeURIComponent(roomId)}&port=${port}&token=${encodeURIComponent(token)}`;
    try {
      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.src = launchUrl;
      document.body.appendChild(iframe);
      setTimeout(() => {
        try { document.body.removeChild(iframe); } catch {}
      }, 2000);
    } catch {
      window.location.href = launchUrl;
    }
  }
}

export const localAgentClient = LocalAgentClient.getInstance();
