"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, User, Zap, Code2, Lightbulb, Bug, StopCircle, Trash2, Paperclip, X,
  Copy, Check, Plus, MessageSquarePlus, History, PenLine, FileCode2, StickyNote,
} from "lucide-react";
import type { FileItem } from "@/components/FileExplorer";
import {
  extractCodeBlocks,
  extractNoteBlocks,
  extractWhiteboardBlocks,
} from "@/lib/ai-response-parser";

type Message = { role: "user" | "assistant"; content: string; ts: number };

type ChatSession = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
};

type ChatStore = {
  sessions: ChatSession[];
  activeSessionId: string;
  autoWrite: boolean;
};

type AttachmentPreview = {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string;
  kind: "image" | "video" | "file";
};

const WELCOME: Message = {
  role: "assistant",
  content: "Hi! I'm your AI coding assistant with **Auto Generation** mode.\n\n**Enable Auto** and I'll automatically:\n- Write complete, working code to your files\n- Fix bugs and create corrected versions\n- Build entire projects with all files\n- Create architecture diagrams\n\nJust describe what you want to build or fix, and I'll generate the code!",
  ts: Date.now(),
};

const QUICK = [
  { icon: <Bug size={12}/>, label: "Fix bugs", prompt: "Find and fix all bugs in this code. Write the complete corrected version to the file:" },
  { icon: <Lightbulb size={12}/>, label: "Explain", prompt: "Explain what this code does step by step:" },
  { icon: <Zap size={12}/>, label: "Optimize", prompt: "Optimize this code for better performance. Write the complete optimized version to the file:" },
  { icon: <Code2 size={12}/>, label: "Add types", prompt: "Add TypeScript types to this code. Write the complete typed version to the file:" },
  { icon: <Plus size={12}/>, label: "Build app", prompt: "Build a complete web application with HTML, CSS, and JavaScript. Create all necessary files with working code:" },
  { icon: <FileCode2 size={12}/>, label: "Create project", prompt: "Create a complete project with all files. Include HTML, CSS, JavaScript, and make it fully functional:" },
];

const TEXT_FILE_EXTENSIONS = new Set([
  ".txt", ".md", ".json", ".yaml", ".yml", ".js", ".jsx", ".ts", ".tsx", ".py",
  ".java", ".cpp", ".c", ".cs", ".go", ".rs", ".php", ".rb", ".html", ".css",
  ".scss", ".sql", ".sh", ".bash", ".env", ".ini", ".toml",
]);

function getFileExtension(name: string) {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf(".");
  return dot >= 0 ? lower.slice(dot) : "";
}

function isTextFile(attachment: AttachmentPreview) {
  if (
    attachment.type.startsWith("text/") ||
    attachment.type.includes("json") ||
    attachment.type.includes("xml") ||
    attachment.type.includes("javascript") ||
    attachment.type.includes("typescript")
  ) {
    return true;
  }
  return TEXT_FILE_EXTENSIONS.has(getFileExtension(attachment.name));
}

function decodeDataUrl(dataUrl: string) {
  const [, payload] = dataUrl.split(",");
  if (!payload) return "";
  const normalized = payload.replace(/\s/g, "");
  return typeof window !== "undefined" ? window.atob(normalized) : Buffer.from(normalized, "base64").toString("binary");
}

function buildAttachmentInsights(attachments: AttachmentPreview[]) {
  if (!attachments.length) return "";
  return attachments.map((attachment) => {
    if (attachment.kind === "image") {
      return `Image attachment: ${attachment.name} (${attachment.type || "image"}). Describe what is shown and explain it clearly.`;
    }
    if (isTextFile(attachment)) {
      try {
        const text = decodeDataUrl(attachment.dataUrl);
        return `Attached file: ${attachment.name}\nContent:\n${text.slice(0, 12000)}`;
      } catch {
        return `Attached file: ${attachment.name} (${attachment.type || "file"}). Read and analyze its contents if possible.`;
      }
    }
    return `Attached file: ${attachment.name} (${attachment.type || "file"}). Analyze it based on the filename and available metadata.`;
  }).join("\n\n");
}

function RobotIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="12" y1="2" x2="12" y2="5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="12" cy="1.5" r="1" fill="#fff"/>
      <rect x="5" y="5" width="14" height="10" rx="3" fill="#fff" fillOpacity="0.95"/>
      <circle cx="9" cy="10" r="1.8" fill="#000"/>
      <circle cx="15" cy="10" r="1.8" fill="#000"/>
      <circle cx="9.6" cy="9.4" r="0.6" fill="#fff"/>
      <circle cx="15.6" cy="9.4" r="0.6" fill="#fff"/>
      <rect x="9" y="12.5" width="6" height="1" rx="0.5" fill="#000" fillOpacity="0.7"/>
      <rect x="7" y="16" width="10" height="6" rx="2" fill="#fff" fillOpacity="0.9"/>
      <rect x="3" y="17" width="3" height="4" rx="1.5" fill="#fff" fillOpacity="0.9"/>
      <rect x="18" y="17" width="3" height="4" rx="1.5" fill="#fff" fillOpacity="0.9"/>
      <rect x="10" y="18" width="4" height="2.5" rx="1" fill="#000" fillOpacity="0.5"/>
    </svg>
  );
}

function formatMessageTime(ts: number): string {
  return new Date(ts).toLocaleString([], { hour: "numeric", minute: "2-digit" });
}

function parseMessagePayload(content: string) {
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.attachments)) {
      return {
        text: typeof parsed.text === "string" ? parsed.text : "",
        attachments: parsed.attachments as AttachmentPreview[],
      };
    }
  } catch {}
  return { text: content, attachments: [] as AttachmentPreview[] };
}

function getTargetFromFenceHeader(header: string, fallback: string) {
  const trimmed = header.trim();
  if (trimmed.startsWith("file:")) return trimmed.slice(5).trim() || fallback;
  const colon = trimmed.indexOf(":");
  if (colon > 0) {
    const maybePath = trimmed.slice(colon + 1).trim();
    if (maybePath) return maybePath;
  }
  return fallback;
}

function sessionTitleFromMessages(msgs: Message[]): string {
  const firstUser = msgs.find((m) => m.role === "user");
  if (!firstUser) return "New Chat";
  const text = parseMessagePayload(firstUser.content).text.trim();
  return text.slice(0, 42) || "New Chat";
}

function createSession(): ChatSession {
  const now = Date.now();
  return {
    id: `chat_${now}`,
    title: "New Chat",
    messages: [{ ...WELCOME, ts: now }],
    createdAt: now,
    updatedAt: now,
  };
}

function loadStore(roomId: string, userId: string): ChatStore {
  const key = `ai_chats_${roomId}_${userId}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as ChatStore;
      if (parsed.sessions?.length && parsed.activeSessionId) return parsed;
    }
  } catch {}
  const session = createSession();
  return { sessions: [session], activeSessionId: session.id, autoWrite: false };
}

function saveStore(roomId: string, userId: string, store: ChatStore) {
  try {
    localStorage.setItem(`ai_chats_${roomId}_${userId}`, JSON.stringify(store));
  } catch {}
}

type AIAssistantProps = {
  roomId: string;
  currentUserId: string;
  currentCode: string;
  language: string;
  activeFile?: string;
  files?: FileItem[];
  onFileCreate?: (name: string, content: string) => void;
  onApplyCode?: (code: string, fileName?: string) => void;
  onPanelChange?: (panel: string) => void;
};

export default function AIAssistant({
  roomId,
  currentUserId,
  currentCode,
  language,
  activeFile = "file",
  files = [],
  onFileCreate,
  onApplyCode,
  onPanelChange,
}: AIAssistantProps) {
  const [store, setStore] = useState<ChatStore>(() => loadStore(roomId, currentUserId));
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [attachments, setAttachments] = useState<AttachmentPreview[]>([]);
  const [activeMediaModal, setActiveMediaModal] = useState<{ url: string; name: string; kind: string } | null>(null);
  const [abortCtrl, setAbortCtrl] = useState<AbortController | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeSession = store.sessions.find((s) => s.id === store.activeSessionId) || store.sessions[0];
  const messages = activeSession?.messages || [WELCOME];

  const updateStore = useCallback((updater: (prev: ChatStore) => ChatStore) => {
    setStore((prev) => {
      const next = updater(prev);
      saveStore(roomId, currentUserId, next);
      return next;
    });
  }, [roomId, currentUserId]);

  const setMessages = useCallback((updater: Message[] | ((prev: Message[]) => Message[])) => {
    updateStore((prev) => {
      const session = prev.sessions.find((s) => s.id === prev.activeSessionId);
      if (!session) return prev;
      const nextMessages = typeof updater === "function" ? updater(session.messages) : updater;
      const title = session.title === "New Chat" ? sessionTitleFromMessages(nextMessages) : session.title;
      const sessions = prev.sessions.map((s) =>
        s.id === prev.activeSessionId
          ? { ...s, messages: nextMessages, title, updatedAt: Date.now() }
          : s
      );
      return { ...prev, sessions };
    });
  }, [updateStore]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input, attachments]);

  const showToast = (msg: string) => {
    setActionToast(msg);
    setTimeout(() => setActionToast(null), 3000);
  };

  const applyAutoActions = useCallback((content: string) => {
    if (!store.autoWrite) return [] as string[];

    const codeBlocks = extractCodeBlocks(content);
    const appliedFiles: string[] = [];
    codeBlocks.forEach((block) => {
      const target = block.fileName || (codeBlocks.length === 1 ? activeFile : "");
      const code = block.code.trim();
      if (!target || !code || code.length < 10) return;
      if (onApplyCode) {
        onApplyCode(code, target);
        appliedFiles.push(target);
      } else if (onFileCreate) {
        onFileCreate(target || `generated_${Date.now()}.txt`, code);
        appliedFiles.push(target);
      }
    });
    if (appliedFiles.length) {
      const fileList = appliedFiles.length > 3 
        ? `${appliedFiles.slice(0, 3).join(", ")} +${appliedFiles.length - 3} more`
        : appliedFiles.join(", ");
      showToast(`Auto-wrote ${appliedFiles.length} file(s): ${fileList}`);
    } else if (codeBlocks.length) {
      showToast("Auto skipped code without a clear target file path");
    }

    const noteBlocks = extractNoteBlocks(content);
    noteBlocks.forEach((note) => {
      window.dispatchEvent(new CustomEvent("codetogether:note-create", {
        detail: { roomId, userId: currentUserId, title: note.title, content: note.content },
      }));
    });
    if (noteBlocks.length) {
      onPanelChange?.("notes");
      showToast(`Created ${noteBlocks.length} note(s)`);
    }

    const wbElements = extractWhiteboardBlocks(content);
    if (wbElements.length) {
      window.dispatchEvent(new CustomEvent("codetogether:wb-add", {
        detail: { roomId, elements: wbElements },
      }));
      onPanelChange?.("whiteboard");
      showToast(`Drew ${wbElements.length} element(s) on whiteboard`);
    }

    return appliedFiles;
  }, [store.autoWrite, activeFile, onApplyCode, onFileCreate, roomId, currentUserId, onPanelChange]);

  const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (!selectedFiles.length) return;
    selectedFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : "file";
        setAttachments((prev) => [
          ...prev,
          {
            id: `${file.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            name: file.name,
            type: file.type,
            size: file.size,
            dataUrl,
            kind,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
    event.target.value = "";
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSaveAttachmentToWorkspace = (attachment: AttachmentPreview) => {
    if (!onFileCreate) return;
    try {
      onFileCreate(attachment.name, decodeDataUrl(attachment.dataUrl));
    } catch {
      onFileCreate(attachment.name, `// Content of ${attachment.name}`);
    }
  };

  const startNewChat = () => {
    const session = createSession();
    updateStore((prev) => ({
      ...prev,
      sessions: [session, ...prev.sessions],
      activeSessionId: session.id,
    }));
    setShowHistory(false);
  };

  const switchChat = (id: string) => {
    updateStore((prev) => ({ ...prev, activeSessionId: id }));
    setShowHistory(false);
  };

  const deleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    updateStore((prev) => {
      const remaining = prev.sessions.filter((s) => s.id !== id);
      if (!remaining.length) {
        const session = createSession();
        return { ...prev, sessions: [session], activeSessionId: session.id };
      }
      return {
        ...prev,
        sessions: remaining,
        activeSessionId: prev.activeSessionId === id ? remaining[0].id : prev.activeSessionId,
      };
    });
  };

  const toggleAutoWrite = () => {
    updateStore((prev) => ({ ...prev, autoWrite: !prev.autoWrite }));
  };

  async function send(userPrompt: string) {
    if ((!userPrompt.trim() && !attachments.length) || loading) return;

    const attachmentInsights = buildAttachmentInsights(attachments);
    const combinedContent = attachmentInsights
      ? `${userPrompt.trim()}\n\n[Attachment Details]\n${attachmentInsights}`
      : userPrompt.trim();

    const payloadContent = attachments.length
      ? JSON.stringify({ text: userPrompt.trim(), attachments: attachments.map((a) => ({ ...a })) })
      : userPrompt.trim();

    const userMsg: Message = { role: "user", content: payloadContent, ts: Date.now() };
    const historyForApi = [
      ...messages.filter((m) => m.content !== "▋" && !m.content.startsWith("Error:")),
      { role: "user" as const, content: combinedContent },
    ];

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setAttachments([]);
    setLoading(true);

    const ctrl = new AbortController();
    setAbortCtrl(ctrl);

    try {
      const res = await fetch("/api/ai-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: historyForApi.map((m) => ({ role: m.role, content: m.content })),
          language,
          activeFile,
          autoWrite: store.autoWrite,
          files: files.map((f) => f.path || f.name).filter(Boolean).slice(0, 30),
        }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const errMsg = typeof errJson.error === "string" ? errJson.error : (errJson.error?.message || errJson.message || "AI service unavailable.");
        setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${errMsg}`, ts: Date.now() }]);
        setLoading(false);
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let streamText = "";
      let buffer = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "▋", ts: Date.now() }]);

      while (reader) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data:")) continue;
          
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === "[DONE]") continue;
          
          try {
            const parsed = JSON.parse(dataStr);
            const contentDelta = parsed.choices?.[0]?.delta?.content;
            if (contentDelta && typeof contentDelta === "string") {
              streamText += contentDelta;
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = { role: "assistant", content: streamText, ts: Date.now() };
                return next;
              });
            }
          } catch {}
        }
      }

      if (streamText && store.autoWrite) {
        const appliedFiles = applyAutoActions(streamText);
        if (appliedFiles.length) {
          const fileList = appliedFiles.join(", ");
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = {
              role: "assistant",
              content: `Auto Generation completed. Wrote ${appliedFiles.length} file(s) directly to the workspace: ${fileList}.`,
              ts: Date.now(),
            };
            return next;
          });
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${err.message || "Request failed."}`, ts: Date.now() }]);
      }
    } finally {
      setLoading(false);
      setAbortCtrl(null);
    }
  }

  function copyText(txt: string, idx: number) {
    navigator.clipboard.writeText(txt);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  }

  function fmt(content: string) {
    const blocks = content.split(/(```[\s\S]*?```)/g);
    return blocks.map((b, i) => {
      if (b.startsWith("```")) {
        const inner = b.slice(3, -3).trim();
        const nl = inner.indexOf("\n");
        const header = nl >= 0 ? inner.slice(0, nl).trim() : inner;
        const code = nl >= 0 ? inner.slice(nl + 1) : "";
        const isNote = header.startsWith("note");
        const isWb = header.startsWith("whiteboard");

        return (
          <div key={i} className="my-2 rounded-lg border border-gray-800 bg-black overflow-hidden text-xs">
            <div className="flex items-center justify-between px-3 py-1.5 bg-[#0a0a0a] border-b border-gray-800 text-gray-400">
              <span className="font-mono text-[11px] uppercase text-white font-bold flex items-center gap-1">
                {isNote ? <StickyNote size={10}/> : isWb ? <PenLine size={10}/> : <FileCode2 size={10}/>}
                {header || "code"}
              </span>
              <div className="flex items-center gap-2">
                {!isNote && !isWb && onApplyCode && (
                  <button
                    onClick={() => {
                      const fileName = getTargetFromFenceHeader(header, activeFile);
                      onApplyCode(code, fileName || activeFile);
                      showToast(`Applied to ${fileName || activeFile}`);
                    }}
                    className="bg-white/10 border border-white/20 rounded px-2 py-0.5 text-white text-[10px] cursor-pointer font-bold flex items-center gap-1 hover:bg-white/20"
                  >
                    <PenLine size={10}/> Apply
                  </button>
                )}
                {onFileCreate && !isNote && !isWb && (
                  <button
                    onClick={() => {
                      const ext = header.split(":")[0] || "txt";
                      const fileName = getTargetFromFenceHeader(header, `generated_${Date.now().toString().slice(-4)}.${ext}`);
                      onFileCreate(fileName, code);
                      showToast(`Added ${fileName}`);
                    }}
                    className="bg-white/10 border border-white/20 rounded px-2 py-0.5 text-white text-[10px] cursor-pointer font-bold flex items-center gap-1 hover:bg-white/20"
                  >
                    <Plus size={10}/> Add
                  </button>
                )}
                <button onClick={() => copyText(code, i)} className="bg-transparent border-none text-gray-400 cursor-pointer flex items-center gap-1 hover:text-white">
                  {copiedIndex === i ? <Check size={11} className="text-white"/> : <Copy size={11}/>}
                  <span>{copiedIndex === i ? "Copied" : "Copy"}</span>
                </button>
              </div>
            </div>
            <pre className="p-3 m-0 overflow-x-auto font-mono text-[12px] leading-relaxed text-gray-200 bg-black">
              <code>{code}</code>
            </pre>
          </div>
        );
      }
      return <span key={i} className="whitespace-pre-wrap">{b}</span>;
    });
  }

  return (
    <div className="flex h-full bg-black text-gray-200 font-inter">
      {/* Chat history sidebar */}
      {showHistory && (
        <div className="w-[200px] shrink-0 border-r border-gray-900 bg-[#050505] flex flex-col">
          <div className="px-3 py-2 border-b border-gray-900 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Chat History</span>
            <button onClick={() => setShowHistory(false)} className="bg-transparent border-none text-gray-500 cursor-pointer hover:text-white">
              <X size={12}/>
            </button>
          </div>
          <button
            onClick={startNewChat}
            className="mx-2 mt-2 mb-1 flex items-center gap-1.5 px-2.5 py-1.5 bg-white text-black rounded-lg border-none cursor-pointer text-[11px] font-bold hover:bg-gray-200"
          >
            <MessageSquarePlus size={12}/> New Chat
          </button>
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {store.sessions.map((s) => (
              <div
                key={s.id}
                onClick={() => switchChat(s.id)}
                className={`group flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer mb-0.5 text-[11px] ${
                  s.id === store.activeSessionId ? "bg-white/15 text-white" : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
                }`}
              >
                <span className="flex-1 truncate">{s.title}</span>
                <button
                  onClick={(e) => deleteChat(s.id, e)}
                  className="opacity-0 group-hover:opacity-100 bg-transparent border-none text-gray-500 cursor-pointer p-0 hover:text-red-400"
                >
                  <Trash2 size={10}/>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col flex-1 min-w-0 h-full bg-black">
        {/* Header */}
        <div className="px-3 py-2 bg-black border-b border-gray-900 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={() => setShowHistory((v) => !v)} title="Chat history" className="bg-transparent border-none text-gray-400 cursor-pointer p-1 hover:text-white">
              <History size={14}/>
            </button>
            <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center shrink-0">
              <RobotIcon size={12}/>
            </div>
            <span className="text-xs font-black tracking-wider text-white uppercase truncate">{activeSession?.title || "AI Assistant"}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={toggleAutoWrite}
              title={store.autoWrite ? "Auto Generation ON — AI writes complete code automatically" : "Enable Auto Generation — AI will write complete working code"}
              className={`flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-bold cursor-pointer transition-colors ${
                store.autoWrite
                  ? "bg-white text-black border-white"
                  : "bg-transparent text-gray-400 border-gray-700 hover:border-white hover:text-white"
              }`}
            >
              <PenLine size={10}/> {store.autoWrite ? "⚡ Auto ON" : "Auto OFF"}
            </button>
            <button onClick={startNewChat} title="New chat" className="bg-transparent border-none text-gray-400 cursor-pointer p-1 hover:text-white">
              <MessageSquarePlus size={14}/>
            </button>
          </div>
        </div>

        {actionToast && (
          <div className="px-3 py-1.5 bg-white/10 border-b border-white/20 text-[11px] text-white text-center shrink-0">
            {actionToast}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-[8px_0] bg-black">
          {messages.map((msg, i) => {
            const { text: messageText, attachments: messageAttachments } = parseMessagePayload(msg.content);
            const isErr = messageText.startsWith("Error:");

            return (
              <div key={i} className="px-3 py-1.5">
                <div className={`flex gap-2 items-start ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                  <div className={`w-[26px] h-[26px] rounded-full flex items-center justify-center shrink-0 ${
                    msg.role === "user" ? "bg-white text-black" : "bg-gray-800 text-white"
                  }`}>
                    {msg.role === "user" ? <User size={12}/> : <RobotIcon size={14}/>}
                  </div>
                  <div className={`max-w-[88%] text-[13px] leading-relaxed px-3.5 py-2.5 border ${
                    isErr
                      ? "bg-red-500/10 border-red-500/30 text-red-400 rounded-lg"
                      : msg.role === "user"
                        ? "bg-white/10 border-white/20 text-white rounded-[14px_4px_14px_14px]"
                        : "bg-[#0a0a0a] border-gray-800 text-gray-200 rounded-[4px_14px_14px_14px]"
                  }`}>
                    {msg.content === "▋" ? <span className="animate-pulse">▋</span> : (
                      <>
                        {messageAttachments.length > 0 && (
                          <div className="grid gap-1.5 mb-1.5">
                            {messageAttachments.map((attachment) => (
                              <div key={attachment.id || attachment.name} className="border border-gray-800 rounded-lg overflow-hidden bg-black">
                                {attachment.kind === "image" ? (
                                  <img
                                    src={attachment.dataUrl}
                                    alt={attachment.name}
                                    onClick={() => setActiveMediaModal({ url: attachment.dataUrl, name: attachment.name, kind: attachment.kind })}
                                    className="block max-w-full max-h-[180px] object-cover cursor-pointer"
                                  />
                                ) : attachment.kind === "video" ? (
                                  <video src={attachment.dataUrl} controls className="block w-full max-h-[180px] bg-black"/>
                                ) : (
                                  <div className="p-[8px_10px] flex items-center justify-between gap-2">
                                    <span className="text-[12px] font-semibold">{attachment.name}</span>
                                    {onFileCreate && isTextFile(attachment) && (
                                      <button
                                        onClick={() => handleSaveAttachmentToWorkspace(attachment)}
                                        className="bg-white/20 border border-white text-white rounded px-1.5 py-0.5 text-[10px] cursor-pointer font-bold flex items-center gap-1"
                                      >
                                        <Plus size={10}/> Add
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {messageText ? fmt(messageText) : null}
                        <div className="text-[10px] text-gray-600 mt-1.5">{formatMessageTime(msg.ts)}</div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef}/>
        </div>

        {/* Quick prompts */}
        {!loading && (
          <div className="p-[6px_10px] flex gap-1.5 flex-wrap border-t border-gray-900 bg-black shrink-0">
            {QUICK.map((a) => (
              <button
                key={a.label}
                onClick={() => send(`${a.prompt}\nTarget file: ${activeFile}`)}
                className="flex items-center gap-1 px-2.5 py-1 bg-[#0f0f0f] border border-gray-800 rounded-full cursor-pointer text-[11px] text-gray-400 hover:border-white hover:text-white transition-colors"
              >
                {a.icon} {a.label}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="p-[10px_12px] border-t border-gray-900 bg-black shrink-0">
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {attachments.map((attachment) => (
                <div key={attachment.id} className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/15 text-gray-200 text-[11px]">
                  <span>{attachment.name}</span>
                  <button onClick={() => removeAttachment(attachment.id)} className="bg-transparent border-none text-inherit cursor-pointer p-0">
                    <X size={12}/>
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 items-end bg-[#0a0a0a] border border-gray-800 rounded-xl p-[8px_10px] focus-within:border-gray-500 transition-colors">
            <button onClick={() => fileInputRef.current?.click()} className="bg-transparent border-none text-gray-400 cursor-pointer p-[2px_4px] hover:text-white">
              <Paperclip size={15}/>
            </button>
            <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,.pdf,.txt,.doc,.docx,.zip" onChange={handleFileSelection} className="hidden"/>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
              placeholder="Describe what you want to build or fix... (Enter to send)"
              rows={1}
              className="flex-1 bg-transparent border-none outline-none text-white text-[13px] resize-none leading-relaxed max-h-[120px] overflow-y-auto font-sans"
            />
            {loading ? (
              <button onClick={() => abortCtrl?.abort()} className="w-[30px] h-[30px] rounded-lg border-none cursor-pointer bg-red-500/20 text-red-400 flex items-center justify-center shrink-0">
                <StopCircle size={14}/>
              </button>
            ) : (
              <button
                onClick={() => send(input)}
                disabled={!input.trim() && attachments.length === 0}
                className="w-[30px] h-[30px] rounded-lg border-none cursor-pointer bg-white text-black flex items-center justify-center shrink-0 disabled:opacity-30 hover:bg-gray-200 font-bold"
              >
                <Send size={13}/>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Media modal */}
      {activeMediaModal && (
        <div className="fixed inset-0 z-[9999999] bg-black/90 backdrop-blur-[12px] flex items-center justify-center p-5" onClick={() => setActiveMediaModal(null)}>
          <div onClick={(e) => e.stopPropagation()} className="max-w-[90vw] max-h-[85vh] bg-[#0a0a0a] border border-gray-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
            <div className="px-4 py-2.5 bg-[#121212] flex items-center justify-between border-b border-gray-800">
              <span className="text-[13px] font-bold text-white">{activeMediaModal.name}</span>
              <button onClick={() => setActiveMediaModal(null)} className="bg-transparent border-none text-gray-400 cursor-pointer hover:text-white">
                <X size={16}/>
              </button>
            </div>
            <div className="p-3 flex items-center justify-center bg-black flex-1 overflow-auto">
              {activeMediaModal.kind === "image" ? (
                <img src={activeMediaModal.url} alt={activeMediaModal.name} className="max-w-full max-h-[75vh] object-contain rounded-lg"/>
              ) : (
                <video src={activeMediaModal.url} controls autoPlay className="max-w-full max-h-[75vh] rounded-lg"/>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
