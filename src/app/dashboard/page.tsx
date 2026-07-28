"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import MonacoEditor from "@monaco-editor/react";
import {
  Plus, Code2, Trash2, ArrowRight, LogOut, Clock, Users,
  BookOpen, GraduationCap, Tv, Briefcase, Hash, Search,
  Globe, Copy, Check, Layers, Zap, Folder, File, Download, X, Laptop,
  Calendar, Award, Mail
} from "lucide-react";
import AccountProfilePanel from "@/components/AccountProfilePanel";
import StudentToolsPanel from "@/components/StudentToolsPanel";

type AppUser = { id: string; name: string | null; email: string; role: string };
type Room = { id: string; name: string | null; room_code: string; language: string; created_at: string; files_json?: any[] };

const ROLE_CONFIG: Record<string, { icon: any; color: string; label: string; greeting: string }> = {
  student: { icon: GraduationCap, color: "#4ade80", label: "Student", greeting: "Ready to learn?" },
  teacher: { icon: BookOpen, color: "#60a5fa", label: "Teacher", greeting: "Your classroom awaits" },
  youtube: { icon: Tv, color: "#f87171", label: "Creator", greeting: "Start streaming!" },
  business: { icon: Briefcase, color: "#c084fc", label: "Business", greeting: "Build with your team" },
  tutor: { icon: BookOpen, color: "#60a5fa", label: "Tutor", greeting: "Your students await" },
  freelancer: { icon: Code2, color: "#f87171", label: "Freelancer", greeting: "Your next project awaits" },
};

const LANGS = ["javascript","typescript","python","java","cpp","c","go","rust","html","css","shell","php","ruby","csharp","kotlin","swift","r","lua"];
const CATEGORIES = ["All", "Tutorials", "Algorithms", "Templates", "Web Pages", "Others"];

// Pure JS uncompressed ZIP generator helper
function downloadProjectAsZip(projectName: string, files: any[]) {
  const textEncoder = new TextEncoder();
  const zipParts: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    if (file.isFolder) continue;
    const pathBytes = textEncoder.encode(file.path || file.name);
    const contentBytes = textEncoder.encode(file.content || "");
    const size = contentBytes.length;
    
    // Local file header signature
    const lfHeader = new Uint8Array(30 + pathBytes.length);
    const view = new DataView(lfHeader.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 10, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, 0, true); // store method
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint32(14, 0, true);
    view.setUint32(18, size, true);
    view.setUint32(22, size, true);
    view.setUint16(26, pathBytes.length, true);
    view.setUint16(28, 0, true);
    lfHeader.set(pathBytes, 30);
    
    // Central directory file header
    const cdHeader = new Uint8Array(46 + pathBytes.length);
    const cdView = new DataView(cdHeader.buffer);
    cdView.setUint32(0, 0x02014b50, true);
    cdView.setUint16(4, 20, true);
    cdView.setUint16(6, 10, true);
    cdView.setUint16(8, 0, true);
    cdView.setUint16(10, 0, true);
    cdView.setUint16(12, 0, true);
    cdView.setUint16(14, 0, true);
    cdView.setUint32(16, 0, true);
    cdView.setUint32(20, size, true);
    cdView.setUint32(24, size, true);
    cdView.setUint16(28, pathBytes.length, true);
    cdView.setUint16(30, 0, true);
    cdView.setUint16(32, 0, true);
    cdView.setUint16(34, 0, true);
    cdView.setUint16(36, 0, true);
    cdView.setUint32(38, 0, true);
    cdView.setUint32(42, offset, true);
    cdHeader.set(pathBytes, 46);
    
    zipParts.push(lfHeader, contentBytes);
    directory.push(cdHeader);
    offset += lfHeader.length + contentBytes.length;
  }

  const dirOffset = offset;
  let dirSize = 0;
  for (const part of directory) {
    dirSize += part.length;
  }

  // End of central directory record
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(4, 0, true);
  eocdView.setUint16(6, 0, true);
  eocdView.setUint16(8, directory.length, true);
  eocdView.setUint16(10, directory.length, true);
  eocdView.setUint32(12, dirSize, true);
  eocdView.setUint32(16, dirOffset, true);
  eocdView.setUint16(20, 0, true);

  const finalBlob = new Blob([...zipParts, ...directory, eocd] as any[], { type: "application/zip" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(finalBlob);
  a.download = `${projectName.toLowerCase().replace(/\s+/g, "-")}.zip`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function getRoomDisplayName(roomName: string | null): string {
  if (!roomName) return "Untitled Workspace";
  if (roomName.startsWith("{")) {
    try {
      const parsed = JSON.parse(roomName);
      if (parsed.isLibrary && parsed.title) return parsed.title;
      if (parsed.isScheduled && parsed.title) return parsed.title;
    } catch {}
  }
  return roomName;
}

function getRoomScheduleDetails(roomName: string | null) {
  if (roomName && roomName.startsWith("{")) {
    try {
      const parsed = JSON.parse(roomName);
      if (parsed.isScheduled) {
        return {
          isScheduled: true,
          startAt: parsed.startAt,
          endAt: parsed.endAt,
          invitedEmails: parsed.invitedEmails || [],
        };
      }
    } catch {}
  }
  return { isScheduled: false, startAt: null, endAt: null, invitedEmails: [] };
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [libraryRooms, setLibraryRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [joinInput, setJoinInput] = useState("");
  const [search, setSearch] = useState("");
  const [newRoomLang, setNewRoomLang] = useState("javascript");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Tab State
  const [activeTab, setActiveTab] = useState<"workspaces" | "library" | "account" | "progress">("workspaces");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab === "workspaces" || tab === "library" || tab === "account" || tab === "progress") {
      setActiveTab(tab);
    }
  }, []);

  // Room Scheduling States
  const [isScheduled, setIsScheduled] = useState(false);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [invitedEmails, setInvitedEmails] = useState("");

  // Library States
  const [librarySearch, setLibrarySearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [exploreItem, setExploreItem] = useState<any | null>(null);
  const [exploreActiveFile, setExploreActiveFile] = useState("");
  const [exploreFileContent, setExploreFileContent] = useState("");
  const [cloningProject, setCloningProject] = useState(false);

  const loadRooms = useCallback(async (userId: string) => {
    const { data } = await supabase.from("rooms").select("*").eq("created_by", userId).order("created_at", { ascending: false });
    if (data) setRooms(data);
  }, []);

  const loadLibraryRooms = useCallback(async () => {
    const { data } = await supabase
      .from("rooms")
      .select("*")
      .eq("is_active", false)
      .order("created_at", { ascending: false });

    if (data) {
      const parsed = data
        .map((r) => {
          try {
            const meta = JSON.parse(r.name || "");
            if (meta && meta.isLibrary) {
              return { ...r, meta };
            }
          } catch {}
          return null;
        })
        .filter(Boolean);
      setLibraryRooms(parsed);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { router.replace("/login"); return; }
      const { data: profile } = await supabase.from("users").select("*").eq("id", session.user.id).maybeSingle();
      const fallbackProfile = {
        id: session.user.id,
        name: session.user.user_metadata?.name || session.user.email?.split("@")[0] || "User",
        email: session.user.email || "",
        role: session.user.user_metadata?.role || "student",
      };
      const appProfile = profile || fallbackProfile;
      if (!profile) {
        await supabase.from("users").upsert(appProfile, { onConflict: "id" });
      }
      setUser(appProfile);
      await loadRooms(appProfile.id);
      await loadLibraryRooms();
      setLoading(false);
    })();
  }, [router, loadRooms, loadLibraryRooms]);

  async function handleCreate() {
    if (!user) return;
    setCreating(true);

    if (isScheduled && (!startAt || !endAt)) {
      alert("Please provide both start and end times for the scheduled room.");
      setCreating(false);
      return;
    }

    const roomNameStr = isScheduled
      ? JSON.stringify({
          isScheduled: true,
          title: `${user.name || "My"}'s Scheduled Workspace`,
          startAt,
          endAt,
          invitedEmails: invitedEmails.split(",").map(e => e.trim().toLowerCase()).filter(Boolean),
        })
      : `${user.name || "My"}'s Workspace`;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      alert("Please sign in again to create a room.");
      setCreating(false);
      return;
    }

    const res = await fetch("/api/create-room", {
      method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
      body: JSON.stringify({ createdBy: user.id, roomName: roomNameStr, language: newRoomLang }),
    });
    const room = await res.json();
    if (res.ok && room.id) {
      router.push(`/room/${room.id}`);
    } else {
      alert(room.error || "Failed to create room.");
    }
    setCreating(false);
  }

  async function handleJoin() {
    const code = joinInput.trim().toUpperCase();
    if (!code) return;
    const { data } = await supabase.from("rooms").select("id, is_active").eq("room_code", code).maybeSingle();
    if (data?.is_active === false) alert("This session has ended. Only the owner can reopen the workspace.");
    else if (data) router.push(`/room/${data.id}`);
    else alert("Room not found. Check the code.");
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this workspace?")) return;
    await supabase.from("rooms").delete().eq("id", id);
    setRooms(p => p.filter(r => r.id !== id));
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  }

  // Clone action for shared library items
  async function handleCloneProject(item: any) {
    if (!user) return;
    setCloningProject(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in again to clone a project.");

      const res = await fetch("/api/create-room", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
        body: JSON.stringify({
          createdBy: user.id,
          roomName: `${item.meta?.title || "Cloned Workspace"}`,
          language: item.language,
          files: item.files_json,
        }),
      });
      const room = await res.json();
      if (res.ok && room.id) {
        router.push(`/room/${room.id}`);
      } else {
        alert(room.error || "Failed to clone project.");
      }
    } catch (err) {
      console.error(err);
      alert("An error occurred during cloning.");
    } finally {
      setCloningProject(false);
    }
  }

  // Download individual file
  function handleDownloadFile(fileName: string, content: string) {
    const blob = new Blob([content], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName.split("/").pop() || fileName;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const cfg = ROLE_CONFIG[user?.role || "student"] || ROLE_CONFIG.student;
  const RoleIcon = cfg.icon;

  const filtered = rooms.filter(r => getRoomDisplayName(r.name).toLowerCase().includes(search.toLowerCase()) || r.room_code.includes(search.toUpperCase()));

  const filteredLibrary = libraryRooms.filter((item) => {
    const title = item.meta?.title || "";
    const description = item.meta?.description || "";
    const category = item.meta?.category || "Others";
    const author = item.meta?.authorName || "Anonymous";
    const lang = item.language || "";

    const matchesSearch =
      title.toLowerCase().includes(librarySearch.toLowerCase()) ||
      description.toLowerCase().includes(librarySearch.toLowerCase()) ||
      author.toLowerCase().includes(librarySearch.toLowerCase()) ||
      lang.toLowerCase().includes(librarySearch.toLowerCase());

    const matchesCategory =
      selectedCategory === "All" ||
      category.toLowerCase() === selectedCategory.toLowerCase();

    return matchesSearch && matchesCategory;
  });

  const LANG_COLORS: Record<string, string> = { javascript: "#f1e05a", typescript: "#3178c6", python: "#3572A5", java: "#b07219", go: "#00ADD8", rust: "#dea584", html: "#e34c26", css: "#563d7c", cpp: "#f34b7d" };

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#080810", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", border: "3px solid #7C3AED33", borderTop: "3px solid #7C3AED", animation: "spin 1s linear infinite", margin: "0 auto 16px" }} />
        <p style={{ color: "#666", fontSize: 14 }}>Loading your dashboard...</p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#080810", color: "#e0e0e0", fontFamily: "Inter, sans-serif" }}>
      {/* Top navbar */}
      <header className="glass-header animate-slide-up" style={{ height: 60, borderBottom: "1px solid #1a1a2e", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px", position: "sticky", top: 0, zIndex: 100 }}>
        <Link href="/" style={{ fontSize: 20, fontWeight: 900, color: "#7C3AED", textDecoration: "none" }}>
          Code<span style={{ color: "#c4b5fd" }}>Together</span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: cfg.color + "15", border: `1px solid ${cfg.color}30`, borderRadius: 20, padding: "5px 12px" }}>
            <RoleIcon size={14} color={cfg.color}/>
            <span style={{ fontSize: 12, color: cfg.color, fontWeight: 700 }}>{cfg.label}</span>
          </div>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg,#7C3AED,#5b21b6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "#fff" }}>
            {(user?.name || user?.email || "U").charAt(0).toUpperCase()}
          </div>
          <button onClick={async () => { await supabase.auth.signOut(); router.push("/"); }}
            style={{ background: "none", border: "1px solid #222", borderRadius: 8, padding: "6px 12px", color: "#666", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
            <LogOut size={14}/> Logout
          </button>
        </div>
      </header>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>
        {/* Welcome */}
        <div className="animate-slide-up" style={{ marginBottom: 30 }}>
          <h1 style={{ fontSize: "clamp(24px,4vw,36px)", fontWeight: 900, letterSpacing: "-0.5px" }}>
            {cfg.greeting}, <span style={{ color: cfg.color }}>{user?.name?.split(" ")[0] || "there"}</span> <span className="animate-float" style={{ display: "inline-block" }}>👋</span>
          </h1>
          <p style={{ color: "#555", fontSize: 15, marginTop: 6 }}>
            {user?.email} · {rooms.length} workspace{rooms.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Tab Selection */}
        <div className="animate-slide-up delay-100" style={{ display: "flex", gap: 8, borderBottom: "1px solid #1a1a2e", paddingBottom: 12, marginBottom: 30 }}>
          <button
            onClick={() => setActiveTab("workspaces")}
            style={{
              padding: "10px 20px", background: activeTab === "workspaces" ? "#7C3AED18" : "transparent",
              color: activeTab === "workspaces" ? "#c4b5fd" : "#666", border: "none",
              borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer", transition: "all 0.2s"
            }}
          >
            My Workspaces
          </button>
          <button
            onClick={() => setActiveTab("library")}
            style={{
              padding: "10px 20px", background: activeTab === "library" ? "#7C3AED18" : "transparent",
              color: activeTab === "library" ? "#c4b5fd" : "#666", border: "none",
              borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer", transition: "all 0.2s"
            }}
          >
            Shared Library
          </button>
          <button
            onClick={() => setActiveTab("account")}
            style={{
              padding: "10px 20px", background: activeTab === "account" ? "#7C3AED18" : "transparent",
              color: activeTab === "account" ? "#c4b5fd" : "#666", border: "none",
              borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer", transition: "all 0.2s"
            }}
          >
            My Profile
          </button>
          <button
            onClick={() => setActiveTab("progress")}
            style={{
              padding: "10px 20px", background: activeTab === "progress" ? "#7C3AED18" : "transparent",
              color: activeTab === "progress" ? "#c4b5fd" : "#666", border: "none",
              borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer", transition: "all 0.2s"
            }}
          >
            Progress Tracking
          </button>
        </div>

        {activeTab === "workspaces" && (
          <>
            {/* Quick actions row */}
            <div className="animate-slide-up delay-200" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16, marginBottom: 40 }}>
              {/* Create room card */}
              <div className="glass-panel hover-card-glow" style={{ borderRadius: 20, padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "#7C3AED20", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Plus size={18} color="#7C3AED"/>
                  </div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>New Workspace</h3>
                </div>
                
                <div>
                  <label style={{ fontSize: 10, color: "#555", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Language</label>
                  <select value={newRoomLang} onChange={e => setNewRoomLang(e.target.value)}
                    style={{ width: "100%", background: "#111", border: "1px solid #222", borderRadius: 8, padding: "8px 12px", color: "#ccc", fontSize: 13, outline: "none" }}>
                    {LANGS.map(l => <option key={l} value={l}>{l.charAt(0).toUpperCase()+l.slice(1)}</option>)}
                  </select>
                </div>

                {/* Scheduling Toggle */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0" }}>
                  <input
                    type="checkbox"
                    id="schedule-toggle"
                    checked={isScheduled}
                    onChange={e => setIsScheduled(e.target.checked)}
                    style={{ accentColor: "#7C3AED", cursor: "pointer" }}
                  />
                  <label htmlFor="schedule-toggle" style={{ fontSize: 12, color: "#aaa", fontWeight: 600, cursor: "pointer" }}>
                    Schedule Room (Custom Timer)
                  </label>
                </div>

                {isScheduled && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, background: "#111", padding: 12, borderRadius: 10, border: "1px solid #222" }}>
                    <div>
                      <label style={{ fontSize: 9, color: "#666", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 3 }}>Start Time</label>
                      <input
                        type="datetime-local"
                        value={startAt}
                        onChange={e => setStartAt(e.target.value)}
                        style={{ width: "100%", background: "#0d0d1a", border: "1px solid #333", borderRadius: 6, color: "#fff", fontSize: 12, padding: "5px 8px", outline: "none", boxSizing: "border-box" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 9, color: "#666", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 3 }}>End Time</label>
                      <input
                        type="datetime-local"
                        value={endAt}
                        onChange={e => setEndAt(e.target.value)}
                        style={{ width: "100%", background: "#0d0d1a", border: "1px solid #333", borderRadius: 6, color: "#fff", fontSize: 12, padding: "5px 8px", outline: "none", boxSizing: "border-box" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 9, color: "#666", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 3 }}>Invite Users (Emails, comma sep.)</label>
                      <input
                        type="text"
                        placeholder="e.g. user1@gmail.com, user2@gmail.com"
                        value={invitedEmails}
                        onChange={e => setInvitedEmails(e.target.value)}
                        style={{ width: "100%", background: "#0d0d1a", border: "1px solid #333", borderRadius: 6, color: "#fff", fontSize: 12, padding: "5px 8px", outline: "none", boxSizing: "border-box" }}
                      />
                    </div>
                  </div>
                )}

                <button onClick={handleCreate} disabled={creating}
                  style={{ width: "100%", padding: "10px", background: creating ? "#333" : "linear-gradient(135deg,#7C3AED,#5b21b6)", border: "none", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 700, cursor: creating ? "default" : "pointer" }}>
                  {creating ? "Creating..." : isScheduled ? "Schedule Workspace" : "Create Room"}
                </button>
              </div>

              {/* Join room card */}
              <div className="glass-panel hover-card-glow" style={{ borderRadius: 20, padding: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "#4ade8020", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Hash size={18} color="#4ade80"/>
                  </div>
                  <h3 style={{ fontSize: 16, fontWeight: 700 }}>Join via Code</h3>
                </div>
                <input value={joinInput} onChange={e => setJoinInput(e.target.value.toUpperCase())} onKeyDown={e => e.key === "Enter" && handleJoin()}
                  placeholder="Enter code e.g. XK9P2M"
                  style={{ width: "100%", background: "#111", border: "1px solid #222", borderRadius: 8, padding: "8px 12px", color: "#fff", fontSize: 14, letterSpacing: 2, fontWeight: 700, outline: "none", marginBottom: 12, boxSizing: "border-box" }}
                />
                <button onClick={handleJoin}
                  style={{ width: "100%", padding: "10px", background: "#4ade8020", border: "1px solid #4ade8044", borderRadius: 10, color: "#4ade80", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                  Join Room →
                </button>
              </div>

              {/* Stats card */}
              <div className="glass-panel hover-card-glow" style={{ borderRadius: 20, padding: 24 }}>
                <h3 style={{ fontSize: 14, color: "#555", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 20 }}>Your Stats</h3>
                {[
                  { label: "Workspaces", value: rooms.length, color: "#7C3AED" },
                  { label: "Account Type", value: cfg.label, color: cfg.color },
                  { label: "Status", value: "Active", color: "#4ade80" },
                ].map(s => (
                  <div key={s.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #111" }}>
                    <span style={{ color: "#666", fontSize: 13 }}>{s.label}</span>
                    <span style={{ color: s.color, fontWeight: 700, fontSize: 14 }}>{s.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Workspace list */}
            <div className="animate-slide-up delay-300">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
                <h2 style={{ fontSize: 20, fontWeight: 800 }}>My Workspaces</h2>
                <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#0d0d1a", border: "1px solid #1a1a2e", borderRadius: 10, padding: "8px 14px" }}>
                  <Search size={14} color="#555"/>
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search workspaces..."
                    style={{ background: "none", border: "none", outline: "none", color: "#ccc", fontSize: 13, width: 180 }}
                  />
                </div>
              </div>

              {filtered.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 20px", background: "#0d0d1a", borderRadius: 20, border: "1px dashed #1a1a2e" }}>
                  <Layers size={40} color="#333" style={{ margin: "0 auto 16px" }}/>
                  <p style={{ color: "#555", fontSize: 15, marginBottom: 16 }}>No workspaces yet</p>
                  <button onClick={handleCreate} style={{ padding: "10px 24px", background: "#7C3AED", border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, cursor: "pointer" }}>
                    Create your first room
                  </button>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16 }}>
                  {filtered.map((room, index) => {
                    const schedule = getRoomScheduleDetails(room.name);
                    const displayName = getRoomDisplayName(room.name);

                    return (
                      <div key={room.id} className="glass-panel hover-card-glow animate-slide-up" style={{ animationDelay: `${300 + index * 50}ms`, borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", gap: 14, cursor: "pointer", position: "relative" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                              <h3 style={{ fontWeight: 700, fontSize: 15, margin: 0 }}>{displayName}</h3>
                              {schedule.isScheduled && (
                                <span style={{ fontSize: 10, background: "#7C3AED20", color: "#c4b5fd", padding: "1px 6px", borderRadius: 4, fontWeight: 700 }}>
                                  Scheduled
                                </span>
                              )}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ width: 8, height: 8, borderRadius: "50%", background: LANG_COLORS[room.language] || "#888", display: "inline-block" }}/>
                              <span style={{ fontSize: 12, color: "#555" }}>{room.language}</span>
                            </div>
                          </div>
                          <button onClick={() => handleDelete(room.id)} style={{ background: "none", border: "none", color: "#333", cursor: "pointer", padding: 4, borderRadius: 6, transition: "color 0.15s" }}
                            onMouseOver={e => (e.currentTarget as HTMLElement).style.color = "#f47"}
                            onMouseOut={e => (e.currentTarget as HTMLElement).style.color = "#333"}>
                            <Trash2 size={14}/>
                          </button>
                        </div>

                        {schedule.isScheduled && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, background: "#111", padding: 10, borderRadius: 10, border: "1px solid #222", fontSize: 11, color: "#aaa" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <Calendar size={11} color="#7C3AED" />
                              <span>Starts: {new Date(schedule.startAt!).toLocaleString()}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <Clock size={11} color="#7C3AED" />
                              <span>Ends: {new Date(schedule.endAt!).toLocaleString()}</span>
                            </div>
                            {schedule.invitedEmails.length > 0 && (
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4, alignItems: "center" }}>
                                <Mail size={10} color="#555" />
                                {schedule.invitedEmails.map((email: string) => (
                                  <span key={email} style={{ fontSize: 9, background: "#222", color: "#888", padding: "1px 5px", borderRadius: 4 }}>
                                    {email}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#111", borderRadius: 8, padding: "5px 10px", border: "1px solid #1a1a2e" }}>
                            <Hash size={11} color="#555"/>
                            <span style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 700, letterSpacing: 2, color: "#ccc" }}>{room.room_code}</span>
                            <button onClick={() => copyCode(room.room_code)} style={{ background: "none", border: "none", cursor: "pointer", color: "#555", padding: 0, display: "flex" }}>
                              {copiedCode === room.room_code ? <Check size={11} color="#4ade80"/> : <Copy size={11}/>}
                            </button>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 5, color: "#555", fontSize: 11 }}>
                            <Clock size={11}/>
                            {new Date(room.created_at).toLocaleDateString()}
                          </div>
                        </div>

                        <button onClick={() => router.push(`/room/${room.id}`)}
                          style={{ padding: "9px", background: "#7C3AED18", border: "1px solid #7C3AED33", borderRadius: 10, color: "#c4b5fd", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.15s" }}
                          onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = "#7C3AED"; (e.currentTarget as HTMLElement).style.color = "#fff"; }}
                          onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = "#7C3AED18"; (e.currentTarget as HTMLElement).style.color = "#c4b5fd"; }}>
                          <Code2 size={14}/> Open Workspace <ArrowRight size={13}/>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === "library" && (
          /* Shared Library Tab */
          <div className="animate-slide-up delay-200">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800 }}>Shared Library</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#0d0d1a", border: "1px solid #1a1a2e", borderRadius: 10, padding: "8px 14px" }}>
                <Search size={14} color="#555"/>
                <input value={librarySearch} onChange={e => setLibrarySearch(e.target.value)} placeholder="Search library..."
                  style={{ background: "none", border: "none", outline: "none", color: "#ccc", fontSize: 13, width: 180 }}
                />
              </div>
            </div>

            {/* Predefined Categories Filter */}
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 14, marginBottom: 20 }}>
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    padding: "6px 14px",
                    background: selectedCategory === cat ? "#7C3AED" : "#0d0d1a",
                    border: selectedCategory === cat ? "1px solid #7C3AED" : "1px solid #1a1a2e",
                    borderRadius: 20,
                    color: selectedCategory === cat ? "#fff" : "#888",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.15s"
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>

            {filteredLibrary.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", background: "#0d0d1a", borderRadius: 20, border: "1px dashed #1a1a2e" }}>
                <Layers size={40} color="#333" style={{ margin: "0 auto 16px" }}/>
                <p style={{ color: "#555", fontSize: 15 }}>No matching library projects found.</p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16 }}>
                {filteredLibrary.map((item, index) => (
                  <div
                    key={item.id}
                    className="glass-panel hover-card-glow animate-slide-up" style={{ animationDelay: `${200 + index * 50}ms`, borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", gap: 12, cursor: "pointer" }}
                    onClick={() => {
                      setExploreItem(item);
                      const firstFile = (item.files_json || []).find((f: any) => !f.isFolder);
                      if (firstFile) {
                        setExploreActiveFile(firstFile.path || firstFile.name);
                        setExploreFileContent(firstFile.content || "");
                      } else {
                        setExploreActiveFile("");
                        setExploreFileContent("");
                      }
                    }}
                  >
                    
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <span style={{ fontSize: 10, background: "#7C3AED20", color: "#c4b5fd", padding: "2px 8px", borderRadius: 10, fontWeight: 700, textTransform: "uppercase" }}>
                          {item.meta?.category || "Project"}
                        </span>
                        <h3 style={{ fontWeight: 800, fontSize: 16, marginTop: 6, color: "#fff" }}>{item.meta?.title}</h3>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: LANG_COLORS[item.language] || "#888" }}/>
                        <span style={{ fontSize: 12, color: "#555" }}>{item.language}</span>
                      </div>
                    </div>

                    <p style={{ fontSize: 13, color: "#888", lineHeight: 1.5, margin: "4px 0 8px", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", height: 38 }}>
                      {item.meta?.description}
                    </p>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #111", paddingTop: 10, marginTop: 4 }}>
                      <span style={{ fontSize: 11, color: "#666" }}>by <strong style={{ color: "#ccc" }}>{item.meta?.authorName || "Anonymous"}</strong></span>
                      <span style={{ fontSize: 11, color: "#555" }}>{new Date(item.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "account" && (
          /* My Profile Tab */
          <div className="animate-slide-up delay-200" style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
            {/* Left Column: Account Profile Editor */}
            <div className="glass-panel" style={{ flex: 1, minWidth: 320, borderRadius: 20, overflow: "hidden" }}>
              <AccountProfilePanel />
            </div>

            {/* Right Column: Gamified Coding Progress Tracker */}
            <div className="glass-panel" style={{ width: "100%", maxWidth: 440, borderRadius: 20, padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid #1a1a2e", paddingBottom: 12 }}>
                <Award size={20} color="#ffd93d" />
                <h2 style={{ fontSize: 18, fontWeight: 800, color: "#fff", margin: 0 }}>My Personal Progress</h2>
              </div>

              {/* Rank / Level */}
              {(() => {
                const totalProjects = rooms.length;
                let levelName = "Novice Developer";
                let currentTarget = 3;
                let prevTarget = 0;
                let levelNum = 1;
                let badgeColor = "#9b5de5";

                if (totalProjects < 3) {
                  levelName = "Novice Developer";
                  currentTarget = 3;
                  prevTarget = 0;
                  levelNum = 1;
                  badgeColor = "#9b5de5";
                } else if (totalProjects < 7) {
                  levelName = "Code Explorer";
                  currentTarget = 7;
                  prevTarget = 3;
                  levelNum = 2;
                  badgeColor = "#00bbf9";
                } else if (totalProjects < 15) {
                  levelName = "Collaborative Specialist";
                  currentTarget = 15;
                  prevTarget = 7;
                  levelNum = 3;
                  badgeColor = "#00f5d4";
                } else {
                  levelName = "Code Master";
                  currentTarget = totalProjects;
                  prevTarget = 15;
                  levelNum = 4;
                  badgeColor = "#ff007f";
                }

                const levelProgress = totalProjects >= 15 ? 100 : ((totalProjects - prevTarget) / (currentTarget - prevTarget)) * 100;

                // Check achievements
                const hasFirstCommit = totalProjects >= 1;
                const hasScheduledRoom = rooms.some(r => {
                  try {
                    const parsed = JSON.parse(r.name || "");
                    return parsed.isScheduled && parsed.invitedEmails?.length > 0;
                  } catch {}
                  return false;
                });
                const hasPublishedProject = libraryRooms.some(r => r.created_by === user?.id);
                const hasVeteran = totalProjects >= 10;

                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      <div style={{
                        width: 60, height: 60, borderRadius: "50%", background: `linear-gradient(135deg, ${badgeColor}, #0d0d1a)`,
                        border: `2px solid ${badgeColor}`, display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 22, fontWeight: 900, color: "#fff", boxShadow: `0 0 15px ${badgeColor}33`
                      }}>
                        {levelNum}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, color: "#666", fontWeight: 600 }}>CURRENT RANK</div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: "#fff" }}>{levelName}</div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#888", marginBottom: 6 }}>
                        <span>Level Progress ({totalProjects} / {totalProjects >= 15 ? "Max" : currentTarget} projects)</span>
                        <span>{Math.round(levelProgress)}%</span>
                      </div>
                      <div style={{ height: 8, background: "#111", borderRadius: 99, overflow: "hidden", border: "1px solid #222" }}>
                        <div style={{ height: "100%", width: `${levelProgress}%`, background: `linear-gradient(90deg, ${badgeColor}, #7c3aed)`, borderRadius: 99 }} />
                      </div>
                      {totalProjects < 15 && (
                        <div style={{ fontSize: 11, color: "#555", marginTop: 6, textAlign: "right" }}>
                          {currentTarget - totalProjects} more project{currentTarget - totalProjects !== 1 ? "s" : ""} to reach Level {levelNum + 1}
                        </div>
                      )}
                    </div>

                    {/* Achievements Checklist */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em" }}>Achievements</div>
                      
                      {[
                        { title: "First Commit", desc: "Create your first collaborative workspace", done: hasFirstCommit },
                        { title: "Team Scheduler", desc: "Create a custom timer room and invite users by email", done: hasScheduledRoom },
                        { title: "Library Contributor", desc: "Publish a project template to the Shared Library", done: hasPublishedProject },
                        { title: "Workspace Veteran", desc: "Develop 10 or more workspace rooms", done: hasVeteran }
                      ].map((ach, idx) => (
                        <div key={idx} style={{
                          display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 10,
                          background: ach.done ? "rgba(16,185,129,0.06)" : "rgba(255,255,255,0.01)",
                          border: `1px solid ${ach.done ? "rgba(16,185,129,0.2)" : "#1a1a2e"}`
                        }}>
                          <div style={{
                            width: 20, height: 20, borderRadius: "50%", background: ach.done ? "#10b981" : "#222",
                            display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: "bold"
                          }}>
                            {ach.done ? "✓" : "?"}
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: ach.done ? "#10b981" : "#ccc" }}>{ach.title}</div>
                            <div style={{ fontSize: 11, color: "#666" }}>{ach.desc}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {activeTab === "progress" && (
          <div className="animate-slide-up delay-200" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
              {[
                { label: "Total Workspaces", value: rooms.length, color: "#7C3AED" },
                { label: "Shared Templates", value: libraryRooms.filter(r => r.created_by === user?.id).length, color: "#10b981" },
                { label: "Languages Used", value: new Set(rooms.map(r => r.language)).size, color: "#60a5fa" },
                { label: "Student Status", value: cfg.label, color: cfg.color },
              ].map((stat) => (
                <div key={stat.label} className="glass-panel hover-card-glow" style={{ borderRadius: 16, padding: 18 }}>
                  <div style={{ fontSize: 11, color: "#666", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{stat.label}</div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: stat.color }}>{stat.value}</div>
                </div>
              ))}
            </div>
            <StudentToolsPanel rooms={rooms} libraryRooms={libraryRooms} userId={user?.id || ""} />
          </div>
        )}
      </div>

      {/* Explore Dialog Modal (Monaco Read-Only + Zip support) */}
      {exploreItem && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
          <div style={{ background: "#1e1e1e", border: "1px solid #333", borderRadius: 16, width: "100%", maxWidth: 1000, height: "85vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 64px rgba(0,0,0,0.8)" }}>
            
            {/* Modal Header */}
            <div style={{ height: 56, borderBottom: "1px solid #2b2b2b", background: "#252526", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 10, background: "#7C3AED20", color: "#c4b5fd", padding: "2px 8px", borderRadius: 10, fontWeight: 700, textTransform: "uppercase" }}>
                  {exploreItem.meta?.category || "Project"}
                </span>
                <span style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>{exploreItem.meta?.title}</span>
                <span style={{ fontSize: 12, color: "#666" }}>by {exploreItem.meta?.authorName}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  disabled={cloningProject}
                  onClick={() => downloadProjectAsZip(exploreItem.meta?.title || "project", exploreItem.files_json || [])}
                  style={{ padding: "6px 12px", background: "#2a2a2a", border: "1px solid #444", borderRadius: 8, color: "#ccc", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
                >
                  <Download size={13} /> Download ZIP
                </button>
                <button
                  onClick={() => handleCloneProject(exploreItem)}
                  disabled={cloningProject}
                  style={{ padding: "6px 16px", background: "linear-gradient(135deg,#7C3AED,#5b21b6)", border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 700, cursor: cloningProject ? "default" : "pointer", display: "flex", alignItems: "center", gap: 5 }}
                >
                  {cloningProject ? "Cloning..." : <><Zap size={13} /> Clone Project</>}
                </button>
                <button
                  onClick={() => setExploreItem(null)}
                  style={{ background: "none", border: "none", color: "#666", cursor: "pointer", display: "flex", padding: 4 }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
              
              {/* Explorer Sidebar */}
              <div style={{ width: 220, background: "#252526", borderRight: "1px solid #2d2d2d", display: "flex", flexDirection: "column", overflowY: "auto", padding: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
                  <Folder size={11}/> Project Files
                </div>
                
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {exploreItem.files_json && exploreItem.files_json.filter((f: any) => !f.isFolder).map((file: any) => {
                    const path = file.path || file.name;
                    return (
                      <div
                        key={path}
                        onClick={() => {
                          setExploreActiveFile(path);
                          setExploreFileContent(file.content || "");
                        }}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 6,
                          cursor: "pointer",
                          background: exploreActiveFile === path ? "#7C3AED22" : "transparent",
                          color: exploreActiveFile === path ? "#c4b5fd" : "#aaa",
                          fontSize: 12,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          transition: "all 0.15s"
                        }}
                      >
                        <File size={12} color={exploreActiveFile === path ? "#c4b5fd" : "#666"} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {path}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Editor Workspace */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#1e1e1e", position: "relative" }}>
                {exploreActiveFile ? (
                  <>
                    <div style={{ height: 28, background: "#2d2d2d", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", borderBottom: "1px solid #252526" }}>
                      <span style={{ fontSize: 11, color: "#888", fontFamily: "monospace" }}>{exploreActiveFile}</span>
                      <button
                        onClick={() => handleDownloadFile(exploreActiveFile, exploreFileContent)}
                        title="Download file"
                        style={{ background: "none", border: "none", color: "#555", cursor: "pointer", display: "flex", padding: 2 }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "#ccc"}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "#555"}
                      >
                        <Download size={12} />
                      </button>
                    </div>
                    <div style={{ flex: 1 }}>
                      <MonacoEditor
                        height="100%"
                        language={exploreActiveFile.split(".").pop() || "javascript"}
                        value={exploreFileContent}
                        theme="vs-dark"
                        options={{
                          readOnly: true,
                          minimap: { enabled: false },
                          fontSize: 13,
                          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                          scrollbar: {
                            verticalScrollbarSize: 8,
                            horizontalScrollbarSize: 8
                          }
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, color: "#444" }}>
                    <Laptop size={32} />
                    <span style={{ fontSize: 13 }}>Select a file to preview code</span>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
