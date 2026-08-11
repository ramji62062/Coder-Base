"use client";

import { useState, useEffect, useRef } from "react";
import { BookOpen, Download, Send, Pin, PinOff, Trash2, Plus, Eye, Edit3, Copy, Check, Globe } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Note = {
  id: string;
  title: string;
  content: string;
  published: boolean;
  pinned: boolean;
  createdAt: number;
  color?: string;
};

const NOTE_COLORS = [
  { id: "default", label: "Default", bg: "#1a1a2e", border: "#333355", accent: "#cccccc" },
  { id: "yellow", label: "Yellow", bg: "#3d3419", border: "#FBBF24", accent: "#FBBF24" },
  { id: "blue", label: "Blue", bg: "#1a2540", border: "#3B82F6", accent: "#60A5FA" },
  { id: "green", label: "Green", bg: "#1a2e1f", border: "#22C55E", accent: "#4ADE80" },
  { id: "purple", label: "Purple", bg: "#2a1a3d", border: "#A855F7", accent: "#C084FC" },
  { id: "pink", label: "Pink", bg: "#3d1a2e", border: "#EC4899", accent: "#F472B6" },
  { id: "orange", label: "Orange", bg: "#3d2519", border: "#F97316", accent: "#FB923C" },
  { id: "cyan", label: "Cyan", bg: "#1a2e3d", border: "#06B6D4", accent: "#22D3EE" },
  { id: "red", label: "Red", bg: "#3d1a1a", border: "#EF4444", accent: "#F87171" },
];

function getNoteColor(id?: string) {
  return NOTE_COLORS.find((c) => c.id === id) || NOTE_COLORS[0];
}

type SharedNote = {
  id: string;
  title: string;
  content: string;
  publisherId: string;
  publisherName: string;
  createdAt: number;
};

interface TeacherNotesProps {
  roomId: string;
  currentUserId: string;
  currentUserName: string;
  isTeacher?: boolean;
}

export default function TeacherNotes({ roomId, currentUserId, currentUserName, isTeacher = false }: TeacherNotesProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [sharedNotes, setSharedNotes] = useState<SharedNote[]>([]);
  const [activeNote, setActiveNote] = useState<string | null>(null);
  const [isActiveShared, setIsActiveShared] = useState(false);
  
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const notesRef = useRef<Note[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    const key = `notes_${roomId}_${currentUserId}`;
    try {
      const stored = localStorage.getItem(key);
      if (stored) setNotes(JSON.parse(stored));
    } catch {}
  }, [roomId, currentUserId]);

  useEffect(() => {
    if (!roomId) return;
    const channel = supabase.channel(`notes:${roomId}`);
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "notes-update" }, ({ payload }: any) => {
        const { note } = payload;
        if (note) {
          setSharedNotes((prev) => {
            const exists = prev.some((n) => n.id === note.id);
            if (exists) {
              return prev.map((n) => (n.id === note.id ? note : n));
            } else {
              return [note, ...prev];
            }
          });
          setActiveNote((currActive) => {
            if (currActive === note.id) {
              setEditTitle(note.title);
              setEditContent(note.content);
            }
            return currActive;
          });
        }
      })
      .on("broadcast", { event: "notes-delete" }, ({ payload }: { payload: { noteId: string } }) => {
        const { noteId } = payload;
        if (noteId) {
          setSharedNotes((prev) => prev.filter((n) => n.id !== noteId));
          setActiveNote((currActive) => {
            if (currActive === noteId) {
              setEditTitle("");
              setEditContent("");
              return null;
            }
            return currActive;
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  const saveToStorage = (updatedNotes: Note[]) => {
    const key = `notes_${roomId}_${currentUserId}`;
    localStorage.setItem(key, JSON.stringify(updatedNotes));
  };

  const createNote = () => {
    const newNote: Note = {
      id: Date.now().toString(),
      title: "Untitled Note",
      content: "",
      published: false,
      pinned: false,
      createdAt: Date.now(),
      color: "default",
    };
    const updated = [newNote, ...notes];
    setNotes(updated);
    saveToStorage(updated);
    selectPrivateNote(newNote);
  };

  const selectPrivateNote = (note: Note) => {
    setActiveNote(note.id);
    setIsActiveShared(false);
    setEditTitle(note.title);
    setEditContent(note.content);
  };

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.roomId !== roomId || detail.userId !== currentUserId) return;
      const newNote: Note = {
        id: Date.now().toString(),
        title: detail.title || "AI Note",
        content: detail.content || "",
        published: false,
        pinned: false,
        createdAt: Date.now(),
        color: "blue",
      };
      setNotes((prev) => {
        const updated = [newNote, ...prev];
        saveToStorage(updated);
        return updated;
      });
      selectPrivateNote(newNote);
    };
    window.addEventListener("codetogether:note-create", handler);
    return () => window.removeEventListener("codetogether:note-create", handler);
  }, [roomId, currentUserId]);

  const selectSharedNote = (note: SharedNote) => {
    setActiveNote(note.id);
    setIsActiveShared(true);
    setEditTitle(note.title);
    setEditContent(note.content);
  };

  const saveActiveNote = () => {
    if (!activeNote || isActiveShared) return;
    setSaving(true);
    const updated = notes.map((n) => {
      if (n.id === activeNote) {
        const noteObj = { ...n, title: editTitle.trim() || "Untitled Note", content: editContent };
        if (n.published && channelRef.current) {
          channelRef.current.send({
            type: "broadcast",
            event: "notes-update",
            payload: {
              note: {
                id: noteObj.id,
                title: noteObj.title,
                content: noteObj.content,
                publisherId: currentUserId,
                publisherName: currentUserName,
                createdAt: noteObj.createdAt,
              },
            },
          });
        }
        return noteObj;
      }
      return n;
    });
    setNotes(updated);
    saveToStorage(updated);
    setTimeout(() => setSaving(false), 300);
  };

  const togglePin = (id: string) => {
    const updated = notes.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n));
    setNotes(updated);
    saveToStorage(updated);
  };

  const togglePublish = (id: string) => {
    const updated = notes.map((n) => {
      if (n.id === id) {
        const nextPub = !n.published;
        if (nextPub && channelRef.current) {
          channelRef.current.send({
            type: "broadcast",
            event: "notes-update",
            payload: {
              note: {
                id: n.id,
                title: n.title,
                content: n.content,
                publisherId: currentUserId,
                publisherName: currentUserName,
                createdAt: n.createdAt,
              },
            },
          });
        } else if (!nextPub && channelRef.current) {
          channelRef.current.send({
            type: "broadcast",
            event: "notes-delete",
            payload: { noteId: n.id },
          });
        }
        return { ...n, published: nextPub };
      }
      return n;
    });
    setNotes(updated);
    saveToStorage(updated);
  };

  const setNoteColor = (id: string, colorId: string) => {
    const updated = notes.map((n) => (n.id === id ? { ...n, color: colorId } : n));
    setNotes(updated);
    saveToStorage(updated);
  };

  const deleteNote = (id: string) => {
    const updated = notes.filter((n) => n.id !== id);
    setNotes(updated);
    saveToStorage(updated);
    if (activeNote === id) {
      setActiveNote(null);
      setEditTitle("");
      setEditContent("");
    }
  };

  const downloadNote = () => {
    const blob = new Blob([editContent], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(editTitle || "note").toLowerCase().replace(/\s+/g, "_")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(editContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sortedNotes = [...notes].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  const activePrivate = notes.find((n) => n.id === activeNote);
  const activeShared = sharedNotes.find((n) => n.id === activeNote);
  const hasActive = activeNote !== null;

  const activeColor = getNoteColor(activePrivate?.color);

  function renderMarkdown(md: string, accentColor = "#fff") {
    return md
      .replace(/^### (.*$)/gim, `<h3 style="font-size:15px;font-weight:700;margin:12px 0 6px;color:${accentColor};">$1</h3>`)
      .replace(/^## (.*$)/gim, `<h2 style="font-size:17px;font-weight:800;margin:16px 0 8px;color:${accentColor};">$1</h2>`)
      .replace(/^# (.*$)/gim, `<h1 style="font-size:20px;font-weight:900;margin:20px 0 10px;color:${accentColor};">$1</h1>`)
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, '<code style="background:#222;padding:2px 6px;border-radius:4px;font-family:monospace;font-size:12px;color:#fff;">$1</code>')
      .replace(/```([\s\S]*?)```/g, '<pre style="background:#111;padding:12px;border-radius:8px;overflow-x:auto;font-family:monospace;font-size:12px;color:#ccc;"><code>$1</code></pre>')
      .replace(/\n/g, "<br/>");
  }

  return (
    <div className="flex h-full bg-ct-dark-black text-gray-200 font-inter">
      {/* Sidebar List */}
      <div className="w-[200px] border-r border-[#222222] flex flex-col bg-ct-dark-black">
        <div className="p-3 border-b border-[#222222] flex items-center justify-between">
          <div className="text-[11px] font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <BookOpen size={13}/> Notes
          </div>
          <button onClick={createNote} title="New note" className="p-1 bg-white text-black border-none rounded cursor-pointer hover:bg-gray-200 transition-colors">
            <Plus size={13}/>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-1.5 flex flex-col gap-1">
          {/* Private Notes */}
          <div className="text-[10px] text-gray-500 uppercase tracking-wider px-2 py-1 font-bold">My Notes</div>
          {sortedNotes.length === 0 && (
            <div className="text-[11px] text-gray-600 px-2 py-2 italic">No notes yet. Click + to create.</div>
          )}
          {sortedNotes.map((note) => {
            const noteColor = getNoteColor(note.color);
            return (
            <div
              key={note.id}
              onClick={() => selectPrivateNote(note)}
              className={`p-2 rounded-lg cursor-pointer transition-colors border-l-2 ${
                activeNote === note.id && !isActiveShared ? "text-white" : "hover:bg-white/5 text-gray-300"
              }`}
              style={{
                borderLeftColor: noteColor.border,
                backgroundColor: activeNote === note.id && !isActiveShared ? noteColor.bg : undefined,
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold truncate flex-1 mr-1" style={{ color: noteColor.accent }}>{note.title}</span>
                {note.pinned && <Pin size={10} className="shrink-0" style={{ color: noteColor.accent }} />}
              </div>
              <div className="flex justify-between items-center text-[9px] text-gray-500 mt-1">
                <span>{new Date(note.createdAt).toLocaleDateString()}</span>
                {note.published && <span className="text-green-400">Shared</span>}
              </div>
            </div>
          );})}

          {/* Shared Classroom Notes */}
          {sharedNotes.length > 0 && (
            <>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider px-2 pt-3 pb-1 font-bold flex items-center gap-1">
                <Globe size={10}/> Classroom Notes
              </div>
              {sharedNotes.map((note) => (
                <div
                  key={note.id}
                  onClick={() => selectSharedNote(note)}
                  className={`p-2 rounded-lg cursor-pointer transition-colors ${
                    activeNote === note.id && isActiveShared ? "bg-white/15 text-white" : "hover:bg-white/5 text-gray-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold truncate flex-1 mr-1">{note.title}</span>
                  </div>
                  <div className="flex justify-between items-center text-[9px] text-gray-500 mt-1">
                    <span>by {note.publisherName}</span>
                    <span>{new Date(note.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Editor area */}
      <div className="flex-1 flex flex-col">
        {hasActive ? (
          <>
            {/* Toolbar */}
            <div
              className="p-[8px_12px] border-b border-[#222222] flex items-center gap-1.5 flex-wrap"
              style={{ backgroundColor: activeColor.bg }}
            >
              {isActiveShared ? (
                <div className="flex-1 text-sm font-bold text-white flex items-center gap-1.5">
                  <Globe size={14} className="text-green-400" />
                  <span>{editTitle}</span>
                  <span className="text-[10px] text-gray-500 font-normal">Shared by {activeShared?.publisherName}</span>
                </div>
              ) : (
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={saveActiveNote}
                  placeholder="Note title..."
                  className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-sm font-bold text-white"
                />
              )}
              <div className="flex gap-1 items-center">
                {isActiveShared ? (
                  <>
                    <button onClick={copyToClipboard} title="Copy to Clipboard"
                      className="px-2 py-1 border border-[#333] rounded-md bg-transparent text-gray-300 cursor-pointer text-xs flex items-center gap-1 hover:text-white">
                      {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
                    </button>
                    <button onClick={downloadNote} title="Download Markdown"
                      className="px-2 py-1 border border-[#333] rounded-md bg-transparent text-gray-300 cursor-pointer text-xs flex items-center gap-1 hover:text-white">
                      <Download size={12} /> Save
                    </button>
                  </>
                ) : (
                  <>
                    {!isActiveShared && activePrivate && (
                      <div className="flex items-center gap-1 mr-1">
                        {NOTE_COLORS.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => setNoteColor(activePrivate.id, c.id)}
                            title={c.label}
                            className={`w-4 h-4 rounded-full border-2 transition-transform hover:scale-110 ${
                              activePrivate.color === c.id || (!activePrivate.color && c.id === "default")
                                ? "border-white scale-110"
                                : "border-transparent"
                            }`}
                            style={{ backgroundColor: c.border }}
                          />
                        ))}
                      </div>
                    )}
                    <button onClick={() => setPreview((p) => !p)} title={preview ? "Edit" : "Preview"}
                      className={`px-2 py-1 border border-[#333] rounded-md text-xs flex items-center gap-1 cursor-pointer transition-colors ${
                        preview ? "bg-white/20 text-white" : "bg-transparent text-gray-400 hover:text-white"
                      }`}>
                      {preview ? <Edit3 size={12} /> : <Eye size={12} />} {preview ? "Edit" : "Preview"}
                    </button>
                    <button onClick={() => activePrivate && togglePin(activePrivate.id)} title="Pin" className="bg-transparent border-none p-1 cursor-pointer">
                      {activePrivate?.pinned
                        ? <PinOff size={14} className="text-white" />
                        : <Pin size={14} className="text-gray-500 hover:text-white" />}
                    </button>
                    <button onClick={downloadNote} title="Download Markdown"
                      className="p-[4px_6px] border border-[#333] rounded-md bg-transparent text-gray-400 cursor-pointer hover:text-white">
                      <Download size={12} />
                    </button>
                    {(isTeacher || activePrivate?.published) && activePrivate && (
                      <button onClick={() => togglePublish(activePrivate.id)} title="Publish to classroom"
                        className={`px-2 py-1 border border-[#333] rounded-md text-xs flex items-center gap-1 cursor-pointer transition-colors ${
                          activePrivate.published ? "bg-green-500/20 text-green-400 border-green-500/40" : "bg-transparent text-gray-400 hover:text-white"
                        }`}>
                        <Send size={12} /> {activePrivate.published ? "Shared" : "Share"}
                      </button>
                    )}
                    <button onClick={() => activePrivate && deleteNote(activePrivate.id)} title="Delete"
                      className="p-[4px_6px] border border-[#333] rounded-md bg-transparent text-red-400 cursor-pointer hover:bg-red-500/20">
                      <Trash2 size={12} />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto" style={{ backgroundColor: activeColor.bg }}>
              {preview ? (
                <div
                  className="p-5 text-sm leading-relaxed text-gray-300"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(editContent, activeColor.accent) }}
                />
              ) : (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  onBlur={saveActiveNote}
                  placeholder={`# ${editTitle}\n\nStart writing your notes here...\n\nMarkdown is supported!\n- **Bold** text\n- *Italic* text\n- \`inline code\`\n- Code blocks with triple backticks`}
                  className="w-full h-full bg-transparent border-none outline-none text-gray-300 text-sm leading-relaxed p-4 resize-none font-mono box-border"
                  style={{ color: activeColor.accent }}
                />
              )}
            </div>

            {/* Status bar */}
            <div className="px-3.5 py-1 border-t border-[#222222] text-[10px] text-gray-500 flex justify-between" style={{ backgroundColor: activeColor.bg }}>
              <span>{isActiveShared ? "Shared Notes" : saving ? "Saving..." : "Saved"} · Markdown</span>
              <span>{editContent.split(/\s+/).filter(Boolean).length} words</span>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center flex-col gap-3 text-gray-500">
            <BookOpen size={36} className="opacity-30" />
            <p className="text-xs">Select a note or create a new one</p>
            <button onClick={createNote}
              className="px-5 py-2 bg-white border-none rounded-lg text-black cursor-pointer text-xs font-bold hover:bg-gray-200 transition-colors">
              + New Note
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
