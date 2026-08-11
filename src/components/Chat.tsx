"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  Paperclip, X, MessageSquare, Users, User, GripHorizontal, Minus,
  Maximize2, ChevronLeft, Send, Edit2, Trash2, Pencil
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type PresenceMember = { userId: string; name: string; avatar?: string | null };

type ChatPanelProps = {
  roomId: string;
  currentUserId: string;
  currentUserName: string;
  members?: PresenceMember[];
  onNewMessage?: () => void;
  isDocked?: boolean;
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

type DirectMessage = {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  content: string;
  createdAt: string;
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

function isWithin10Minutes(createdAtStr: string): boolean {
  if (!createdAtStr) return false;
  const createdMs = new Date(createdAtStr).getTime();
  if (Number.isNaN(createdMs)) return false;
  const elapsedMs = Date.now() - createdMs;
  return elapsedMs >= 0 && elapsedMs <= 10 * 60 * 1000;
}

function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
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

export default function ChatPanel({
  roomId,
  currentUserId,
  currentUserName,
  members = [],
  onNewMessage,
  isDocked = false,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([]);
  const [chatTab, setChatTab] = useState<"group" | "dm">("group");
  const [selectedDmUser, setSelectedDmUser] = useState<PresenceMember | null>(null);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentPreview[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeMediaModal, setActiveMediaModal] = useState<{ url: string; name: string; kind: string } | null>(null);

  // Edit message state
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  // Floating Window state
  const [floatingPos, setFloatingPos] = useState<{ x: number; y: number } | null>(null);
  const [floatingSize, setFloatingSize] = useState<{ w: number; h: number }>({ w: 380, h: 480 });
  const [isChatHidden, setIsChatHidden] = useState(false);
  const [isFloatingMinimized, setIsFloatingMinimized] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; posX: number; posY: number }>({ mouseX: 0, mouseY: 0, posX: 0, posY: 0 });
  const isResizingRef = useRef(false);
  const resizeStartRef = useRef<{ mouseX: number; mouseY: number; startW: number; startH: number }>({ mouseX: 0, mouseY: 0, startW: 380, startH: 480 });

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    if (isDocked) return;
    e.preventDefault();
    e.stopPropagation();
    isResizingRef.current = true;
    resizeStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startW: floatingSize.w,
      startH: floatingSize.h,
    };

    const handleMouseMove = (me: MouseEvent) => {
      if (!isResizingRef.current) return;
      const dw = me.clientX - resizeStartRef.current.mouseX;
      const dh = me.clientY - resizeStartRef.current.mouseY;
      const newW = Math.max(300, Math.min(window.innerWidth - 40, resizeStartRef.current.startW + dw));
      const newH = Math.max(320, Math.min(window.innerHeight - 40, resizeStartRef.current.startH + dh));
      setFloatingSize({ w: newW, h: newH });
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const listRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const dmChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Initialize Floating Pos
  useEffect(() => {
    if (typeof window !== "undefined" && !floatingPos) {
      setFloatingPos({
        x: Math.max(20, window.innerWidth - 420),
        y: Math.max(20, window.innerHeight - 520),
      });
    }
  }, [floatingPos]);

  // Handle Window Dragging
  const handleDragMouseDown = (e: React.MouseEvent) => {
    if (isDocked) return;
    e.preventDefault();
    isDraggingRef.current = true;
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      posX: floatingPos?.x || (window.innerWidth - 420),
      posY: floatingPos?.y || (window.innerHeight - 520),
    };

    const handleMouseMove = (me: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = me.clientX - dragStartRef.current.mouseX;
      const dy = me.clientY - dragStartRef.current.mouseY;
      const newX = Math.max(10, Math.min(window.innerWidth - 120, dragStartRef.current.posX + dx));
      const newY = Math.max(10, Math.min(window.innerHeight - 60, dragStartRef.current.posY + dy));
      setFloatingPos({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // Load Group Chat
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
        async ({ new: inserted }: { new: any }) => {
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
            if (data.user_id !== currentUserId) {
              setUnreadCount((p) => p + 1);
              if (onNewMessage) onNewMessage();
            }
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `room_id=eq.${roomId}` },
        ({ new: updated }: { new: any }) => {
          setMessages((prev) => prev.map((m) => m.id === updated.id ? { ...m, content: updated.content } : m));
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages", filter: `room_id=eq.${roomId}` },
        ({ old: deleted }: { old: any }) => {
          setMessages((prev) => prev.filter((m) => m.id !== deleted.id));
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomId, currentUserId, onNewMessage]);

  // ── Edit & Delete Handlers ──
  const handleEditMessage = useCallback(async (msgId: string, newContent: string) => {
    const trimmed = newContent.trim();
    if (!trimmed) return;
    setEditingMsgId(null);
    setEditText("");
    setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, content: trimmed } : m));
    await supabase.from("messages").update({ content: trimmed }).eq("id", msgId);
  }, []);

  const handleDeleteMessage = useCallback(async (msgId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
    await supabase.from("messages").delete().eq("id", msgId);
  }, []);

  // Load and Listen for Direct Messages (DMs)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedDms = localStorage.getItem(`codetogether_dm_${roomId}_${currentUserId}`);
      if (savedDms) {
        try { setDirectMessages(JSON.parse(savedDms)); } catch {}
      }
    }

    const channel = supabase.channel(`room:${roomId}:dms`);
    dmChannelRef.current = channel;

    channel
      .on("broadcast", { event: "dm-message" }, ({ payload }: { payload: DirectMessage }) => {
        if (payload.recipientId === currentUserId || payload.senderId === currentUserId) {
          setDirectMessages((prev) => {
            if (prev.some((m) => m.id === payload.id)) return prev;
            const updated = [...prev, payload];
            if (typeof window !== "undefined") {
              localStorage.setItem(`codetogether_dm_${roomId}_${currentUserId}`, JSON.stringify(updated));
            }
            return updated;
          });
          if (payload.senderId !== currentUserId) {
            setUnreadCount((p) => p + 1);
            if (onNewMessage) onNewMessage();
          }
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomId, currentUserId, onNewMessage]);

  // Auto scroll
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, directMessages, selectedDmUser, chatTab]);

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

  // Send Group Message or DM
  const send = useCallback(async () => {
    const content = text.trim();
    if ((!content && attachments.length === 0) || sending) return;
    setSending(true);
    setShowEmoji(false);

    const payloadContent = attachments.length
      ? JSON.stringify({
          text: content,
          attachments: attachments.map((attachment) => ({ ...attachment })),
        })
      : content;

    if (chatTab === "dm" && selectedDmUser) {
      const dmMsg: DirectMessage = {
        id: `dm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        senderId: currentUserId,
        senderName: currentUserName,
        recipientId: selectedDmUser.userId,
        content: payloadContent,
        createdAt: new Date().toISOString(),
      };

      setDirectMessages((prev) => {
        const updated = [...prev, dmMsg];
        if (typeof window !== "undefined") {
          localStorage.setItem(`codetogether_dm_${roomId}_${currentUserId}`, JSON.stringify(updated));
        }
        return updated;
      });

      if (dmChannelRef.current) {
        dmChannelRef.current.send({
          type: "broadcast",
          event: "dm-message",
          payload: dmMsg,
        });
      }
      setText("");
      setAttachments([]);
      setSending(false);
      return;
    }

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
  }, [attachments, currentUserId, currentUserName, roomId, sending, text, chatTab, selectedDmUser]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const activeDmMessages = useMemo(() => {
    if (!selectedDmUser) return [];
    return directMessages.filter(
      (m) =>
        (m.senderId === currentUserId && m.recipientId === selectedDmUser.userId) ||
        (m.senderId === selectedDmUser.userId && m.recipientId === currentUserId)
    );
  }, [directMessages, currentUserId, selectedDmUser]);

  const otherMembers = useMemo(() => {
    return members.filter((m) => m.userId !== currentUserId);
  }, [members, currentUserId]);

  const handleOpenFloating = () => {
    setIsFloatingMinimized(false);
    setUnreadCount(0);
  };

  if (!isDocked && isChatHidden) return null;

  if (!isDocked && isFloatingMinimized) {
    return (
      <div
        style={{
          left: floatingPos?.x ?? 20,
          top: floatingPos?.y ?? 20,
        }}
        className="fixed z-[999999] bg-[#12121a]/95 border border-white/45 rounded-[24px] px-3.5 py-1.5 flex items-center gap-[10px] shadow-float-panel backdrop-blur-[16px] cursor-move select-none animate-fade-in"
        onMouseDown={handleDragMouseDown}
      >
        <GripHorizontal size={14} className="text-gray-400 cursor-grab" />
        <div className="flex items-center gap-[6px]">
          <MessageSquare size={16} className="text-gray-300" />
          <span className="text-[12px] font-bold text-white">Chat</span>
          {unreadCount > 0 && (
            <span className="text-[10px] bg-red-500 text-white px-1.5 py-[1px] rounded-[10px] font-extrabold">
              {unreadCount}
            </span>
          )}
        </div>
        <button
          onClick={handleOpenFloating}
          title="Expand Chat Window"
          className="bg-white/20 border border-white rounded-[12px] px-2 py-1 text-gray-200 cursor-pointer flex items-center hover:bg-white/30 transition-colors"
        >
          <Maximize2 size={12} />
        </button>
        <button
          onClick={() => setIsChatHidden(true)}
          title="Close Chat"
          className="bg-white/10 border border-[#555] rounded-[12px] px-2 py-1 text-gray-400 cursor-pointer flex items-center ml-1 hover:text-white transition-colors"
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  const mainContent = (
    <div className="flex flex-col h-full bg-ct-panel text-gray-200">
      {/* Lightbox Media Modal */}
      {activeMediaModal && (
        <div
          className="fixed inset-0 z-[9999999] bg-ct-dark-black/90 backdrop-blur-[12px] flex flex-col items-center justify-center p-5"
          onClick={() => setActiveMediaModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-[90vw] max-h-[85vh] bg-ct-header border border-white/45 rounded-[16px] overflow-hidden shadow-2xl flex flex-col"
          >
            <div className="px-4 py-2.5 bg-[#1a1a24] flex items-center justify-between border-b border-white/10">
              <span className="text-[13px] font-bold text-white">{activeMediaModal.name}</span>
              <div className="flex gap-2.5 items-center">
                <a href={activeMediaModal.url} download={activeMediaModal.name} className="text-gray-200 text-[12px] font-bold no-underline bg-white/20 px-2.5 py-1 rounded-md hover:bg-white/30 transition-colors">
                  Download
                </a>
                <button onClick={() => setActiveMediaModal(null)} className="bg-none border-none text-gray-400 cursor-pointer hover:text-white">
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="p-3 flex items-center justify-center bg-[#0a0a0d] flex-1 overflow-auto">
              {activeMediaModal.kind === "image" ? (
                <img src={activeMediaModal.url} alt={activeMediaModal.name} className="max-w-full max-h-[75vh] object-contain rounded-lg" />
              ) : activeMediaModal.kind === "video" ? (
                <video src={activeMediaModal.url} controls autoPlay className="max-w-full max-h-[75vh] rounded-lg" />
              ) : (
                <div className="p-7 text-center text-gray-300">
                  <div className="text-[40px] mb-2.5">📎</div>
                  <div className="text-[14px] font-bold text-white">{activeMediaModal.name}</div>
                  <a href={activeMediaModal.url} download={activeMediaModal.name} className="inline-block mt-3.5 px-4 py-2 bg-white text-black rounded-lg no-underline font-bold text-[13px]">
                    Download Attached File
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Top Header / Mode Selector ── */}
      <div
        onMouseDown={!isDocked ? handleDragMouseDown : undefined}
        className={`px-3 py-2 bg-ct-header border-b border-white/10 flex items-center justify-between select-none ${
          !isDocked ? "cursor-move" : "cursor-default"
        }`}
      >
        <div className="flex items-center gap-[6px]">
          {!isDocked && <GripHorizontal size={14} className="text-gray-400" />}
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-gray-300 flex items-center gap-[5px]">
            <MessageSquare size={13} /> Chat & DM
          </span>
        </div>

        {/* Tab Buttons */}
        <div className="flex gap-1 bg-white/10 p-[2px] rounded-md">
          <button
            onClick={() => { setChatTab("group"); setSelectedDmUser(null); }}
            className={`border-none rounded px-2 py-[3px] text-[10px] font-bold cursor-pointer flex items-center gap-1 transition-colors ${
              chatTab === "group" ? "bg-white text-black" : "bg-transparent text-gray-400 hover:text-white"
            }`}
          >
            <Users size={11} /> Group
          </button>
          <button
            onClick={() => setChatTab("dm")}
            className={`border-none rounded px-2 py-[3px] text-[10px] font-bold cursor-pointer flex items-center gap-1 transition-colors ${
              chatTab === "dm" ? "bg-white text-black" : "bg-transparent text-gray-400 hover:text-white"
            }`}
          >
            <User size={11} /> Direct DM
          </button>
        </div>

        {!isDocked && (
          <button
            onClick={() => setIsFloatingMinimized(true)}
            title="Minimize to floating pill"
            className="bg-transparent border-none text-gray-400 cursor-pointer flex p-0.5 hover:text-white transition-colors"
          >
            <Minus size={13} />
          </button>
        )}
      </div>

      {/* ── DM Contact Selection Header ── */}
      {chatTab === "dm" && selectedDmUser && (
        <div className="px-3 py-1.5 bg-white/15 border-b border-white/30 flex items-center gap-2">
          <button onClick={() => setSelectedDmUser(null)} className="bg-transparent border-none text-gray-300 cursor-pointer p-0 flex items-center hover:text-white">
            <ChevronLeft size={16} />
          </button>
          <div className="w-[22px] h-[22px] rounded-full bg-white grid place-items-center text-[10px] font-extrabold text-black">
            {getInitial(selectedDmUser.name)}
          </div>
          <span className="text-[12px] font-bold text-white flex-1">{selectedDmUser.name}</span>
          <span className="text-[10px] text-green-400 bg-green-500/20 px-1.5 py-[1px] rounded-md font-semibold">Private DM</span>
        </div>
      )}

      {/* ── Message Feed Area ── */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-2">
        {/* DM Contact List View */}
        {chatTab === "dm" && !selectedDmUser ? (
          <div className="flex flex-col gap-1.5">
            <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider my-1">
              Room Members ({otherMembers.length})
            </div>
            {otherMembers.length === 0 ? (
              <div className="text-center text-gray-500 text-[12px] py-5">
                No other members online.
              </div>
            ) : (
              otherMembers.map((m) => (
                <div
                  key={m.userId}
                  onClick={() => setSelectedDmUser(m)}
                  className="p-[8px_10px] bg-white/[0.03] border border-white/[0.06] rounded-lg cursor-pointer flex items-center gap-2.5 transition-colors hover:bg-white/[0.08]"
                >
                  <div className="w-[28px] h-[28px] rounded-full bg-gradient-to-br from-white to-gray-300 grid place-items-center text-black text-[12px] font-extrabold">
                    {getInitial(m.name)}
                  </div>
                  <div className="flex-1">
                    <div className="text-[13px] font-bold text-white">{m.name}</div>
                    <div className="text-[10px] text-green-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> Online
                    </div>
                  </div>
                  <span className="text-[11px] text-gray-200 bg-white/20 px-2 py-0.5 rounded-md font-semibold">
                    Message
                  </span>
                </div>
              ))
            )}
          </div>
        ) : (
          /* Group Chat or Active DM Conversation */
          (chatTab === "group" ? messages : activeDmMessages).map((msg: any) => {
            const isGroup = chatTab === "group";
            const mine = isGroup ? msg.user_id === currentUserId : msg.senderId === currentUserId;
            const sender = isGroup ? (mine ? "You" : (msg.users?.[0]?.name || msg.guest_name || "Guest")) : (mine ? "You" : msg.senderName);
            const timeStr = formatMessageTime(isGroup ? msg.created_at : msg.createdAt);
            const { text: messageText, attachments: messageAttachments } = parseMessagePayload(msg.content);
            const canEditDelete = mine && isWithin10Minutes(isGroup ? msg.created_at : msg.createdAt);
            const isEditing = editingMsgId === msg.id;

            return (
              <div key={msg.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`flex gap-2 max-w-[88%] items-end ${mine ? "flex-row-reverse" : "flex-row"}`}>
                  <div className={`w-6 h-6 rounded-full grid place-items-center text-[10px] font-extrabold flex-shrink-0 ${
                    mine ? "bg-white text-black" : "bg-gray-700 text-white"
                  }`}>
                    {getInitial(sender)}
                  </div>
                  <div className={`relative rounded-xl p-[6px_10px] text-[13px] border border-white/10 ${
                    mine ? "bg-gradient-to-br from-white to-gray-200 text-black rounded-br-xs" : "bg-[#262632] text-gray-200 rounded-bl-xs"
                  }`}>
                    <div className={`text-[10px] mb-0.5 font-semibold flex items-center justify-between gap-2 ${
                      mine ? "text-gray-700" : "text-gray-400"
                    }`}>
                      <span>{sender} · {timeStr}</span>
                      {canEditDelete && !isEditing && (
                        <span className="flex gap-1 ml-auto">
                          <button
                            onClick={() => { setEditingMsgId(msg.id); setEditText(messageText); }}
                            title="Edit message"
                            className="bg-transparent border-none cursor-pointer p-0 flex opacity-75 hover:opacity-100"
                          >
                            <Pencil size={10} />
                          </button>
                          <button
                            onClick={() => {
                              if (isGroup) handleDeleteMessage(msg.id);
                              else {
                                setDirectMessages((prev) => {
                                  const updated = prev.filter((m) => m.id !== msg.id);
                                  if (typeof window !== "undefined") localStorage.setItem(`codetogether_dm_${roomId}_${currentUserId}`, JSON.stringify(updated));
                                  return updated;
                                });
                              }
                            }}
                            title="Delete message"
                            className="bg-transparent border-none cursor-pointer p-0 flex opacity-75 hover:opacity-100"
                          >
                            <Trash2 size={10} />
                          </button>
                        </span>
                      )}
                    </div>
                    {messageAttachments.length > 0 && (
                      <div className="grid gap-1.5 mb-1.5">
                        {messageAttachments.map((attachment) => (
                          <div
                            key={attachment.id || attachment.name}
                            onClick={() => setActiveMediaModal({ url: attachment.dataUrl, name: attachment.name, kind: attachment.kind })}
                            className="border border-white/15 rounded-lg overflow-hidden bg-ct-dark-black/25 cursor-pointer"
                            title="Click to expand/view"
                          >
                            {attachment.kind === "image" ? (
                              <img src={attachment.dataUrl} alt={attachment.name} className="block max-w-full max-h-[180px] object-cover" />
                            ) : attachment.kind === "video" ? (
                              <video src={attachment.dataUrl} controls className="block w-full max-h-[180px] bg-ct-dark-black" />
                            ) : (
                              <div className="p-[8px_10px] flex items-center gap-2 text-gray-200">
                                <span>📎</span>
                                <span className="text-[12px] font-semibold">{attachment.name}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {isEditing ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (isGroup) handleEditMessage(msg.id, editText);
                          else {
                            setDirectMessages((prev) => {
                              const updated = prev.map((m) => m.id === msg.id ? { ...m, content: editText.trim() } : m);
                              if (typeof window !== "undefined") localStorage.setItem(`codetogether_dm_${roomId}_${currentUserId}`, JSON.stringify(updated));
                              return updated;
                            });
                            setEditingMsgId(null); setEditText("");
                          }
                        }}
                        className="flex gap-1 items-center"
                      >
                        <input
                          autoFocus
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="flex-1 bg-ct-dark-black/40 border border-white/20 rounded px-1.5 py-0.5 text-white text-[12px] outline-none"
                        />
                        <button type="submit" className="bg-green-500 border-none rounded px-1.5 py-0.5 text-white cursor-pointer text-[10px] font-bold">Save</button>
                        <button type="button" onClick={() => { setEditingMsgId(null); setEditText(""); }} className="bg-red-500 border-none rounded px-1.5 py-0.5 text-white cursor-pointer text-[10px] font-bold">Cancel</button>
                      </form>
                    ) : messageText ? (
                      <div className="whitespace-pre-wrap break-words leading-relaxed">{messageText}</div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Emoji Picker */}
      {showEmoji && (
        <div className="bg-[#1a1a24] border-t border-white/10 p-1.5">
          <div className="emoji-grid">
            {EMOJI_LIST.map((em) => (
              <button key={em} onClick={() => { setText((p) => p + em); setShowEmoji(false); }}>
                {em}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Bar */}
      {(chatTab === "group" || selectedDmUser) && (
        <div className="p-2 border-t border-white/10 flex flex-col gap-1.5 bg-ct-header">
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {attachments.map((attachment) => (
                <div key={attachment.id} className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/15 text-gray-200 text-[11px]">
                  <span>{attachment.name}</span>
                  <button onClick={() => removeAttachment(attachment.id)} className="bg-transparent border-none text-inherit cursor-pointer p-0">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-1.5 items-end">
            <button onClick={() => setShowEmoji((p) => !p)} className="bg-transparent border-none text-gray-400 cursor-pointer text-base p-[4px_2px]" title="Emoji">
              😊
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="bg-transparent border-none text-gray-400 cursor-pointer p-[4px_2px]" title="Attach file">
              <Paperclip size={15} />
            </button>
            <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,.pdf,.txt,.doc,.docx,.zip" onChange={handleFileSelection} className="hidden" />
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={chatTab === "dm" ? `Message ${selectedDmUser?.name}…` : "Message group…"}
              rows={1}
              className="flex-1 bg-[#1f1f2a] border border-white/10 rounded-md text-white text-[13px] px-2 py-1.5 resize-none outline-none font-sans max-h-[120px] overflow-y-auto"
            />
            <button
              onClick={send}
              disabled={sending || (!text.trim() && attachments.length === 0)}
              className="bg-white border-none rounded-md text-black cursor-pointer text-[13px] px-3 py-1.5 font-bold disabled:opacity-50 flex items-center gap-1 hover:bg-gray-200 transition-colors"
            >
              <Send size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // ── Docked Mode ──
  if (isDocked) {
    return mainContent;
  }

  // ── Floating Expanded Window Mode ──
  return (
    <div
      style={{
        left: floatingPos?.x ?? 20,
        top: floatingPos?.y ?? 20,
        width: floatingSize.w,
        height: floatingSize.h,
      }}
      className="fixed min-w-[300px] min-h-[320px] z-[99999] rounded-[16px] overflow-hidden border border-white/40 bg-ct-panel shadow-float-panel flex flex-col animate-fade-in"
    >
      {mainContent}
      {/* Bottom Right Resize Handle */}
      <div
        onMouseDown={handleResizeMouseDown}
        className="absolute right-[3px] bottom-[3px] z-[100002] w-[14px] h-[14px] cursor-nwse-resize flex items-center justify-center text-[10px] text-white/50 select-none"
        title="Drag to resize chat window"
      >
        ◢
      </div>
    </div>
  );
}
