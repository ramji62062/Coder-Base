"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  Play, Share2, LogOut, Mic, MicOff, Video, VideoOff, Monitor, Copy,
  ChevronRight, Code, Search, X, Settings, RotateCcw, Terminal, FileText,
  FolderOpen, Save, FilePlus
} from "lucide-react";

type Participant = { userId: string; name: string; avatar?: string | null };

type RoomTopbarProps = {
  roomId: string;
  roomCode: string;
  roomName: string;
  onRoomNameChange: (name: string) => void;
  language: string;
  onLanguageChange: (lang: string) => void;
  participants: Participant[];
  micOn: boolean;
  cameraOn: boolean;
  screenOn: boolean;
  onMicToggle: () => void;
  onCameraToggle: () => void;
  onScreenToggle: () => void;
  onRunCode: () => void;
  onAddToast?: (msg: string, type: "info" | "error" | "success") => void;
  onPublishClick?: () => void;
};

function getRoomDisplayName(roomName: string | null): string {
  if (!roomName) return "CodeTogether";
  if (roomName.startsWith("{")) {
    try {
      const parsed = JSON.parse(roomName);
      if (parsed.title) return parsed.title;
    } catch {}
  }
  return roomName;
}

type MenuDef = {
  label: string;
  items: { label: string; shortcut?: string; divider?: boolean; action?: () => void }[];
};

export default function RoomTopbar({
  roomId, roomCode, roomName, onRoomNameChange,
  language, onLanguageChange, participants,
  micOn, cameraOn, screenOn,
  onMicToggle, onCameraToggle, onScreenToggle,
  onRunCode, onAddToast, onPublishClick,
}: RoomTopbarProps) {
  const router = useRouter();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    onAddToast?.("Room link copied!", "success");
  }

  async function copyCode() {
    await navigator.clipboard.writeText(roomCode);
    onAddToast?.("Room code copied!", "success");
  }

  const menus: MenuDef[] = [
    {
      label: "File",
      items: [
        { label: "New File", shortcut: "⌘N" },
        { label: "Open File...", shortcut: "⌘O" },
        { label: "Save", shortcut: "⌘S" },
        { label: "Save All", shortcut: "⌘⇧S" },
        { label: "Publish to Library", action: onPublishClick, divider: true },
        { label: "Share Room Link", action: copyLink },
        { label: "Copy Room Code", action: copyCode, divider: true },
        { label: "Leave Room", action: () => router.push("/dashboard") },
      ],
    },
    {
      label: "Edit",
      items: [
        { label: "Undo", shortcut: "⌘Z" },
        { label: "Redo", shortcut: "⌘⇧Z", divider: true },
        { label: "Find", shortcut: "⌘F" },
        { label: "Replace", shortcut: "⌘H" },
      ],
    },
    {
      label: "View",
      items: [
        { label: "Explorer", shortcut: "⌘⇧E" },
        { label: "Search", shortcut: "⌘⇧F" },
        { label: "Terminal", shortcut: "⌘`", divider: true },
        { label: "Toggle Word Wrap", shortcut: "⌥Z" },
      ],
    },
    {
      label: "Run",
      items: [
        { label: "Run Code", shortcut: "⌃↵", action: onRunCode },
        { label: "Stop", shortcut: "⌘." },
      ],
    },
    {
      label: "Help",
      items: [
        { label: "Keyboard Shortcuts" },
        { label: "About CodeTogether" },
      ],
    },
  ];

  useEffect(() => {
    function close(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <>
      {/* ── Title Bar (macOS-style) ── */}
      <div style={{
        height: 28,
        background: "#3c3c3c",
        display: "flex",
        alignItems: "center",
        userSelect: "none",
        position: "relative",
        borderBottom: "1px solid #2a2a2a",
        flexShrink: 0,
      }}>
        {/* Traffic lights placeholder area */}
        <div style={{ width: 72, display: "flex", alignItems: "center", gap: 6, paddingLeft: 12, flexShrink: 0 }}>
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#ff5f57" }} />
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#febc2e" }} />
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#28c840" }} />
        </div>

        {/* Menu bar */}
        <div ref={menuRef} style={{ display: "flex", alignItems: "center", gap: 0, position: "relative", zIndex: 200 }}>
          {menus.map((menu) => (
            <div key={menu.label} style={{ position: "relative" }}>
              <div
                onClick={() => setOpenMenu(openMenu === menu.label ? null : menu.label)}
                onMouseEnter={() => { if (openMenu) setOpenMenu(menu.label); }}
                style={{
                  padding: "0 8px",
                  height: 28,
                  display: "flex",
                  alignItems: "center",
                  fontSize: 13,
                  cursor: "pointer",
                  color: openMenu === menu.label ? "#fff" : "#ccc",
                  background: openMenu === menu.label ? "#094771" : "transparent",
                  userSelect: "none",
                }}
              >
                {menu.label}
              </div>
              {openMenu === menu.label && (
                <div style={{
                  position: "absolute", top: 28, left: 0,
                  background: "#252526", border: "1px solid #454545",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.6)",
                  minWidth: 220, zIndex: 9999, paddingTop: 4, paddingBottom: 4,
                }}>
                  {menu.items.map((item, i) => (
                    <div key={i}>
                      {item.divider && i > 0 && (
                        <div style={{ height: 1, background: "#454545", margin: "4px 0" }} />
                      )}
                      <div
                        onClick={() => { item.action?.(); setOpenMenu(null); }}
                        style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          padding: "4px 20px", fontSize: 13, cursor: "pointer", color: "#ccc",
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#094771"; (e.currentTarget as HTMLElement).style.color = "#fff"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#ccc"; }}
                      >
                        <span>{item.label}</span>
                        {item.shortcut && <span style={{ opacity: 0.6, fontSize: 12, marginLeft: 24 }}>{item.shortcut}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Center: breadcrumb / room name */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", position: "absolute", left: 0, right: 0, pointerEvents: "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#ccc", pointerEvents: "auto" }}>
            <Code size={13} color="#007acc" />
            <span style={{ opacity: 0.8, maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {getRoomDisplayName(roomName)}
            </span>
            <ChevronRight size={12} color="#555" />
            <span style={{ opacity: 0.6 }}>{language}</span>
          </div>
        </div>

        {/* Right: mic/cam/run/share/leave */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 2, paddingRight: 8, flexShrink: 0 }}>
          {/* Media controls */}
          <button
            onClick={onMicToggle}
            title={micOn ? "Mute" : "Unmute"}
            style={{ width: 24, height: 24, borderRadius: 4, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", background: micOn ? "rgba(34,197,94,0.15)" : "transparent", color: micOn ? "#22c55e" : "#666" }}
          >
            {micOn ? <Mic size={13} /> : <MicOff size={13} />}
          </button>
          <button
            onClick={onCameraToggle}
            title={cameraOn ? "Stop camera" : "Start camera"}
            style={{ width: 24, height: 24, borderRadius: 4, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", background: cameraOn ? "rgba(34,197,94,0.15)" : "transparent", color: cameraOn ? "#22c55e" : "#666" }}
          >
            {cameraOn ? <Video size={13} /> : <VideoOff size={13} />}
          </button>
          <button
            onClick={onScreenToggle}
            title={screenOn ? "Stop sharing" : "Share screen"}
            style={{ width: 24, height: 24, borderRadius: 4, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", background: screenOn ? "rgba(124,58,237,0.2)" : "transparent", color: screenOn ? "#a78bfa" : "#666", marginRight: 6 }}
          >
            <Monitor size={13} />
          </button>

          {/* Room code pill */}
          <div
            onClick={copyCode}
            title="Copy room code"
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "2px 8px", background: "#2d2d2d", border: "1px solid #454545", borderRadius: 3, cursor: "pointer", fontSize: 11, color: "#ccc", marginRight: 4 }}
          >
            <span style={{ opacity: 0.5 }}>🔑</span>
            <span style={{ fontFamily: "monospace", letterSpacing: 1 }}>{roomCode || roomId.slice(0, 8)}</span>
            <Copy size={10} style={{ opacity: 0.5 }} />
          </div>

          {/* Run */}
          <button
            onClick={onRunCode}
            style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 10px", background: "#2ea043", border: "none", borderRadius: 3, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
          >
            <Play size={11} fill="white" /> Run
          </button>

          {/* Share */}
          <button
            onClick={copyLink}
            style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 10px", background: "#454545", border: "none", borderRadius: 3, color: "#fff", fontSize: 11, cursor: "pointer", marginLeft: 3 }}
          >
            <Share2 size={11} /> Share
          </button>

          {/* Leave */}
          <button
            onClick={() => router.push("/dashboard")}
            style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 10px", background: "#e81123", border: "none", borderRadius: 3, color: "#fff", fontSize: 11, cursor: "pointer", marginLeft: 3 }}
          >
            <LogOut size={11} /> Leave
          </button>
        </div>
      </div>
    </>
  );
}
