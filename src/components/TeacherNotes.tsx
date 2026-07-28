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
};

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

  // Load private notes from localStorage (room-specific)
  useEffect(() => {
    const key = `notes_${roomId}_${currentUserId}`;
    try {
      const stored = localStorage.getItem(key);
      if (stored) setNotes(JSON.parse(stored));
    } catch {}
  }, [roomId, currentUserId]);

  // Realtime channel subscription for notes sync
  useEffect(() => {
    if (!roomId) return;
    const channel = supabase.channel(`notes:${roomId}`);
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "notes-update" }, ({ payload }) => {
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
          // Update currently viewed shared note if it is active
          setActiveNote((currActive) => {
            if (currActive === note.id) {
              setEditTitle(note.title);
              setEditContent(note.content);
            }
            return currActive;
          });
        }
      })
      .on("broadcast", { event: "notes-delete" }, ({ payload }) => {
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
      .on("broadcast", { event: "notes-request" }, () => {
        // Someone joined and wants published notes
        const myPublishedNotes = notesRef.current
          .filter((n) => n.published)
          .map((n) => ({
            id: n.id,
            title: n.title,
            content: n.content,
            publisherId: currentUserId,
            publisherName: currentUserName,
            createdAt: n.createdAt,
          }));

        if (myPublishedNotes.length > 0) {
          channel.send({
            type: "broadcast",
            event: "notes-sync",
            payload: { notes: myPublishedNotes },
          });
        }
      })
      .on("broadcast", { event: "notes-sync" }, ({ payload }) => {
        if (payload.notes) {
          setSharedNotes((prev) => {
            const merged = [...prev];
            payload.notes.forEach((newNote: SharedNote) => {
              const idx = merged.findIndex((n) => n.id === newNote.id);
              if (idx > -1) {
                merged[idx] = newNote;
              } else {
                merged.push(newNote);
              }
            });
            return merged.sort((a, b) => b.createdAt - a.createdAt);
          });
        }
      })
      .subscribe();

    // Trigger initial request
    setTimeout(() => {
      channel.send({
        type: "broadcast",
        event: "notes-request",
        payload: {},
      });
    }, 500);

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [roomId, currentUserId, currentUserName]);

  function saveToStorage(next: Note[]) {
    const key = `notes_${roomId}_${currentUserId}`;
    try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
    setNotes(next);
  }

  function broadcastNoteUpdate(note: Note) {
    if (channelRef.current && note.published) {
      channelRef.current.send({
        type: "broadcast",
        event: "notes-update",
        payload: {
          note: {
            id: note.id,
            title: note.title,
            content: note.content,
            publisherId: currentUserId,
            publisherName: currentUserName,
            createdAt: note.createdAt,
          },
        },
      });
    }
  }

  function broadcastNoteDelete(noteId: string) {
    if (channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "notes-delete",
        payload: { noteId },
      });
    }
  }

  function createNote() {
    const note: Note = {
      id: Math.random().toString(36).slice(2),
      title: "Untitled Note",
      content: "",
      published: false,
      pinned: false,
      createdAt: Date.now()
    };
    const next = [note, ...notes];
    saveToStorage(next);
    setActiveNote(note.id);
    setIsActiveShared(false);
    setEditTitle(note.title);
    setEditContent(note.content);
    setPreview(false);
  }

  function selectNote(note: Note) {
    setActiveNote(note.id);
    setIsActiveShared(false);
    setEditTitle(note.title);
    setEditContent(note.content);
    setPreview(false);
  }

  function selectSharedNote(note: SharedNote) {
    // If we are the author of this note, auto-redirect selection to "My Notes" for editing
    if (note.publisherId === currentUserId) {
      const privateNote = notes.find((n) => n.id === note.id);
      if (privateNote) {
        selectNote(privateNote);
        return;
      }
    }
    setActiveNote(note.id);
    setIsActiveShared(true);
    setEditTitle(note.title);
    setEditContent(note.content);
    setPreview(true); // Force read-only preview mode
  }

  function saveActiveNote() {
    if (!activeNote || isActiveShared) return;
    setSaving(true);
    const next = notes.map((n) => {
      if (n.id === activeNote) {
        const updated = { ...n, title: editTitle, content: editContent };
        if (updated.published) {
          broadcastNoteUpdate(updated);
        }
        return updated;
      }
      return n;
    });
    saveToStorage(next);
    setTimeout(() => setSaving(false), 600);
  }

  function deleteNote(id: string) {
    const target = notes.find((n) => n.id === id);
    const next = notes.filter((n) => n.id !== id);
    saveToStorage(next);
    if (target?.published) {
      broadcastNoteDelete(id);
    }
    if (activeNote === id) {
      setActiveNote(null);
      setEditTitle("");
      setEditContent("");
    }
  }

  function togglePin(id: string) {
    const next = notes.map((n) => n.id === id ? { ...n, pinned: !n.pinned } : n);
    saveToStorage(next);
  }

  function togglePublish(id: string) {
    const next = notes.map((n) => {
      if (n.id === id) {
        const nextPublished = !n.published;
        const updated = { ...n, published: nextPublished };
        if (nextPublished) {
          broadcastNoteUpdate(updated);
        } else {
          broadcastNoteDelete(id);
        }
        return updated;
      }
      return n;
    });
    saveToStorage(next);
  }

  function downloadNote() {
    const title = editTitle || "note";
    const blob = new Blob([`# ${title}\n\n${editContent}`], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/\s+/g, "-").toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function copyToClipboard() {
    navigator.clipboard.writeText(editContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function renderMarkdown(md: string) {
    return md
      .replace(/^### (.+)$/gm, "<h3 style='font-size:14px;font-weight:700;margin:12px 0 6px;color:#e0e0e0'>$1</h3>")
      .replace(/^## (.+)$/gm, "<h2 style='font-size:16px;font-weight:700;margin:14px 0 8px;color:#fff'>$1</h2>")
      .replace(/^# (.+)$/gm, "<h1 style='font-size:18px;font-weight:800;margin:16px 0 10px;color:#fff'>$1</h1>")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code style='background:#1a1a2e;padding:1px 5px;border-radius:3px;font-size:12px;color:#c4b5fd;font-family:monospace'>$1</code>")
      .replace(/```([\s\S]*?)```/g, "<pre style='background:#0d0d1a;padding:10px;border-radius:6px;overflow-x:auto;font-size:12px;border:1px solid #333;margin:8px 0'><code>$1</code></pre>")
      .replace(/^- (.+)$/gm, "<li style='margin:3px 0;padding-left:4px'>$1</li>")
      .replace(/\n/g, "<br/>");
  }

  const sortedNotes = [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.createdAt - a.createdAt;
  });

  const activeShared = sharedNotes.find((n) => n.id === activeNote);
  const activePrivate = notes.find((n) => n.id === activeNote);
  const hasActive = isActiveShared ? !!activeShared : !!activePrivate;

  return (
    <div style={{ display: "flex", height: "100%", background: "#141420", color: "#e0e0e0" }}>
      {/* Notes list */}
      <div style={{ width: 200, borderRight: "1px solid #222", display: "flex", flexDirection: "column", background: "#1a1a2e", flexShrink: 0 }}>
        <div style={{ padding: "12px 12px 8px", borderBottom: "1px solid #222", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#c4b5fd" }}>
            <BookOpen size={14} /> Notes
          </div>
          <button onClick={createNote}
            style={{ width: 24, height: 24, borderRadius: 6, border: "none", background: "#7C3AED", cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Plus size={12} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          {/* My Notes Header */}
          <div style={{ padding: "10px 12px 4px", fontSize: 10, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: "0.05em" }}>My Notes</div>
          
          {sortedNotes.length === 0 ? (
            <div style={{ padding: "8px 12px", color: "#444", fontSize: 11 }}>No personal notes</div>
          ) : sortedNotes.map((note) => (
            <div key={note.id}
              onClick={() => selectNote(note)}
              style={{
                padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid #1a1a1a",
                background: (activeNote === note.id && !isActiveShared) ? "#7C3AED22" : "transparent",
                borderLeft: (activeNote === note.id && !isActiveShared) ? "2px solid #7C3AED" : "2px solid transparent",
                transition: "all 0.15s"
              }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: (activeNote === note.id && !isActiveShared) ? "#c4b5fd" : "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 110 }}>
                  {note.title}
                </span>
                <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
                  {note.pinned && <Pin size={10} color="#ffd93d" />}
                  {note.published && <Globe size={10} color="#6bcb77" />}
                </div>
              </div>
              <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>
                {new Date(note.createdAt).toLocaleDateString()}
              </div>
            </div>
          ))}

          {/* Shared Notes Header */}
          <div style={{ padding: "16px 12px 4px", fontSize: 10, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: "0.05em", borderTop: "1px solid #222", marginTop: 10 }}>Shared Notes</div>

          {sharedNotes.length === 0 ? (
            <div style={{ padding: "8px 12px", color: "#444", fontSize: 11 }}>No shared notes</div>
          ) : sharedNotes.map((note) => (
            <div key={note.id}
              onClick={() => selectSharedNote(note)}
              style={{
                padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid #1a1a1a",
                background: (activeNote === note.id && isActiveShared) ? "#7C3AED22" : "transparent",
                borderLeft: (activeNote === note.id && isActiveShared) ? "2px solid #7C3AED" : "2px solid transparent",
                transition: "all 0.15s"
              }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: (activeNote === note.id && isActiveShared) ? "#c4b5fd" : "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 130 }}>
                  {note.title}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 9, color: "#555", marginTop: 2 }}>
                <span>by {note.publisherName}</span>
                <span>{new Date(note.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Editor area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {hasActive ? (
          <>
            {/* Toolbar */}
            <div style={{ padding: "8px 12px", borderBottom: "1px solid #222", display: "flex", alignItems: "center", gap: 6, background: "#1a1a2e", flexWrap: "wrap" }}>
              {isActiveShared ? (
                <div style={{ flex: 1, fontSize: 14, fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: 6 }}>
                  <Globe size={14} color="#6bcb77" />
                  <span>{editTitle}</span>
                  <span style={{ fontSize: 10, color: "#666", fontWeight: 400 }}>Shared by {activeShared?.publisherName}</span>
                </div>
              ) : (
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={saveActiveNote}
                  placeholder="Note title..."
                  style={{ flex: 1, minWidth: 120, background: "transparent", border: "none", outline: "none", fontSize: 14, fontWeight: 700, color: "#fff" }}
                />
              )}
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                {isActiveShared ? (
                  <>
                    <button onClick={copyToClipboard} title="Copy to Clipboard"
                      style={{ padding: "4px 8px", border: "1px solid #333", borderRadius: 6, background: "transparent", color: "#888", cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
                      {copied ? <Check size={12} color="#22c55e" /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
                    </button>
                    <button onClick={downloadNote} title="Download Markdown"
                      style={{ padding: "4px 8px", border: "1px solid #333", borderRadius: 6, background: "transparent", color: "#888", cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
                      <Download size={12} /> Save
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setPreview((p) => !p)} title={preview ? "Edit" : "Preview"}
                      style={{ padding: "4px 8px", border: "1px solid #333", borderRadius: 6, background: preview ? "#7C3AED22" : "transparent", color: preview ? "#c4b5fd" : "#666", cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
                      {preview ? <Edit3 size={12} /> : <Eye size={12} />} {preview ? "Edit" : "Preview"}
                    </button>
                    <button onClick={() => activePrivate && togglePin(activePrivate.id)} title="Pin">
                      {activePrivate?.pinned
                        ? <PinOff size={14} color="#ffd93d" style={{ cursor: "pointer" }} />
                        : <Pin size={14} color="#666" style={{ cursor: "pointer" }} />}
                    </button>
                    <button onClick={downloadNote} title="Download Markdown"
                      style={{ padding: "4px 6px", border: "1px solid #333", borderRadius: 6, background: "transparent", color: "#666", cursor: "pointer" }}>
                      <Download size={12} />
                    </button>
                    {(isTeacher || activePrivate?.published) && activePrivate && (
                      <button onClick={() => togglePublish(activePrivate.id)} title="Publish to classroom"
                        style={{ padding: "4px 8px", border: "1px solid #333", borderRadius: 6, background: activePrivate.published ? "#6bcb7722" : "transparent", color: activePrivate.published ? "#6bcb77" : "#666", cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
                        <Send size={12} /> {activePrivate.published ? "Shared" : "Share"}
                      </button>
                    )}
                    <button onClick={() => activePrivate && deleteNote(activePrivate.id)} title="Delete"
                      style={{ padding: "4px 6px", border: "1px solid #333", borderRadius: 6, background: "transparent", color: "#e55", cursor: "pointer" }}>
                      <Trash2 size={12} />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflow: "auto" }}>
              {preview ? (
                <div
                  style={{ padding: 20, fontSize: 13, lineHeight: 1.8, color: "#ccc" }}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(editContent) }}
                />
              ) : (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  onBlur={saveActiveNote}
                  placeholder={`# ${editTitle}\n\nStart writing your notes here...\n\nMarkdown is supported!\n- **Bold** text\n- *Italic* text\n- \`inline code\`\n- Code blocks with triple backticks`}
                  style={{
                    width: "100%", height: "100%", background: "transparent", border: "none", outline: "none",
                    color: "#ccc", fontSize: 13, lineHeight: 1.8, padding: 16, resize: "none",
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace", boxSizing: "border-box"
                  }}
                />
              )}
            </div>

            {/* Status bar */}
            <div style={{ padding: "4px 14px", borderTop: "1px solid #222", fontSize: 10, color: "#555", display: "flex", justifyContent: "space-between" }}>
              <span>{isActiveShared ? "Shared Notes" : saving ? "Saving..." : "Saved"} · Markdown</span>
              <span>{editContent.split(/\s+/).filter(Boolean).length} words</span>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: "#555" }}>
            <BookOpen size={36} style={{ opacity: 0.3 }} />
            <p style={{ fontSize: 13 }}>Select a note or create a new one</p>
            <button onClick={createNote}
              style={{ padding: "8px 20px", background: "#7C3AED", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              + New Note
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
