"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Paperclip, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

type ChatPanelProps = {
  roomId: string;
  currentUserId: string;
  currentUserName: string;
  onNewMessage?: () => void;
};

type ChatMessage = {
  id: string;
  room_id: string;
  user_id: string | null;
  guest_name: string | null;
  content: string;
  created_at: string;
  users?: { name: string | null }[] | null;
};

type AttachmentPreview = {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string;
  kind: "image" | "video" | "file";
};

const EMOJI_LIST = [
  "😀","😂","🤣","😍","🥳","🤔","👍","👎","❤️","🔥",
  "🎉","💯","🙌","👏","🚀","💡","✅","❌","⚡","🎯",
  "😎","🤝","💪","🙏","😱","😅","🤯","💻","🐛","☕",
  "👀","✨","📦","🔧","🎨","📝",
];

function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getInitial(name: string) {
  return (name || "U").charAt(0).toUpperCase();
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
  } catch {
    // fall back to plain text
  }
  return { text: content, attachments: [] as AttachmentPreview[] };
}

export default function ChatPanel({ roomId, currentUserId, onNewMessage }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentPreview[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("messages")
        .select("id, room_id, user_id, guest_name, content, created_at, users(name)")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true })
        .limit(100);
      setMessages((data as ChatMessage[]) || []);
    }
    load();

    const channelName = `room:${roomId}:chat:${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${roomId}` },
        async ({ new: inserted }) => {
          const { data } = await supabase
            .from("messages")
            .select("id, room_id, user_id, guest_name, content, created_at, users(name)")
            .eq("id", inserted.id)
            .maybeSingle();
          if (data) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === data.id)) return prev;
              return [...prev, data as ChatMessage];
            });
            if (data.user_id !== currentUserId && onNewMessage) onNewMessage();
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomId, currentUserId, onNewMessage]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [text, attachments]);

  const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    files.forEach((file) => {
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
    setAttachments((prev) => prev.filter((attachment) => attachment.id !== id));
  };

  const send = useCallback(async () => {
    const content = text.trim();
    if ((!content && attachments.length === 0) || sending) return;
    setSending(true);
    setShowEmoji(false);

    const payload = attachments.length
      ? JSON.stringify({
          text: content,
          attachments: attachments.map((attachment) => ({
            id: attachment.id,
            name: attachment.name,
            type: attachment.type,
            size: attachment.size,
            dataUrl: attachment.dataUrl,
            kind: attachment.kind,
          })),
        })
      : content;

    const { data, error } = await supabase
      .from("messages")
      .insert({ room_id: roomId, user_id: currentUserId, guest_name: null, content: payload })
      .select("id, room_id, user_id, guest_name, content, created_at, users(name)")
      .single();

    if (!error && data) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === data.id)) return prev;
        return [...prev, data as ChatMessage];
      });
      setText("");
      setAttachments([]);
    }
    setSending(false);
  }, [attachments, currentUserId, roomId, sending, text]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--vscode-sidebar)" }}>
      <div
        style={{
          padding: "10px 12px",
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 1,
          color: "#bbbbbb",
          borderBottom: "1px solid var(--vscode-border)",
        }}
      >
        Chat
      </div>

      <div ref={listRef} style={{ flex: 1, overflow: "auto", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
        {messages.map((msg) => {
          const mine = msg.user_id === currentUserId;
          const sender = mine ? "You" : (msg.users?.[0]?.name || msg.guest_name || "Guest");
          const { text: messageText, attachments: messageAttachments } = parseMessagePayload(msg.content);
          return (
            <div key={msg.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  maxWidth: "88%",
                  flexDirection: mine ? "row-reverse" : "row",
                  alignItems: "flex-end",
                }}
              >
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    background: mine ? "var(--brand-violet)" : "#4a4a4a",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#fff",
                    flexShrink: 0,
                  }}
                >
                  {getInitial(sender)}
                </div>
                <div
                  style={{
                    background: mine ? "var(--brand-violet)" : "#2d2d2d",
                    borderRadius: mine ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                    padding: "6px 10px",
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontSize: 10, color: mine ? "rgba(255,255,255,0.7)" : "#999", marginBottom: 2 }}>
                    {sender} · {formatMessageTime(msg.created_at)}
                  </div>
                  {messageAttachments.length > 0 && (
                    <div style={{ display: "grid", gap: 6, marginBottom: 6 }}>
                      {messageAttachments.map((attachment) => (
                        <div key={attachment.id || attachment.name} style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, overflow: "hidden", background: "rgba(0,0,0,0.2)" }}>
                          {attachment.kind === "image" ? (
                            <img src={attachment.dataUrl} alt={attachment.name} style={{ display: "block", maxWidth: "100%", maxHeight: 180, objectFit: "cover" }} />
                          ) : attachment.kind === "video" ? (
                            <video src={attachment.dataUrl} controls style={{ display: "block", width: "100%", maxHeight: 180, background: "#000" }} />
                          ) : (
                            <div style={{ padding: "8px 10px", display: "flex", alignItems: "center", gap: 8, color: "#c4b5fd" }}>
                              <span>📎</span>
                              <span style={{ fontSize: 12 }}>{attachment.name}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {messageText ? (
                    <div style={{ color: "#e0e0e0", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{messageText}</div>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showEmoji && (
        <div
          style={{
            background: "#2d2d2d",
            borderTop: "1px solid var(--vscode-border)",
            padding: 4,
          }}
        >
          <div className="emoji-grid">
            {EMOJI_LIST.map((em) => (
              <button key={em} onClick={() => { setText((p) => p + em); setShowEmoji(false); }}>
                {em}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: 8, borderTop: "1px solid var(--vscode-border)", display: "flex", flexDirection: "column", gap: 6 }}>
        {attachments.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {attachments.map((attachment) => (
              <div key={attachment.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", borderRadius: 999, background: "rgba(124,58,237,0.16)", color: "#d8b4fe", fontSize: 11 }}>
                <span>{attachment.name}</span>
                <button onClick={() => removeAttachment(attachment.id)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0 }}>
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
          <button
            onClick={() => setShowEmoji((p) => !p)}
            style={{
              background: "none",
              border: "none",
              color: "#858585",
              cursor: "pointer",
              fontSize: 18,
              padding: "2px 4px",
              lineHeight: 1,
            }}
            title="Emoji"
          >
            😊
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              background: "none",
              border: "none",
              color: "#858585",
              cursor: "pointer",
              fontSize: 16,
              padding: "2px 4px",
              lineHeight: 1,
            }}
            title="Attach image, video or file"
          >
            <Paperclip size={15} />
          </button>
          <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,.pdf,.txt,.doc,.docx,.zip" onChange={handleFileSelection} style={{ display: "none" }} />
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message…"
            rows={1}
            style={{
              flex: 1,
              background: "var(--vscode-input-bg)",
              border: "1px solid var(--vscode-border)",
              borderRadius: 4,
              color: "#d4d4d4",
              fontSize: 13,
              padding: "6px 8px",
              resize: "none",
              outline: "none",
              fontFamily: "inherit",
              maxHeight: 120,
              overflowY: "auto",
            }}
          />
          <button
            onClick={send}
            disabled={sending || (!text.trim() && attachments.length === 0)}
            style={{
              background: "var(--brand-violet)",
              border: "none",
              borderRadius: 4,
              color: "#fff",
              cursor: "pointer",
              fontSize: 13,
              padding: "6px 10px",
              fontWeight: 600,
              opacity: sending || (!text.trim() && attachments.length === 0) ? 0.5 : 1,
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
