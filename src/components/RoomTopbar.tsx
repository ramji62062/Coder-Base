"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  Play, Share2, LogOut, Mic, MicOff, Video, VideoOff, Monitor, Copy,
  ChevronRight, Code, Search, X, Settings, RotateCcw, Terminal, FileText,
  FolderOpen, Save, FilePlus, Eye
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
  onPreview?: () => void;
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
  onRunCode, onPreview, onAddToast, onPublishClick,
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
      <div className="h-[28px] bg-ct-vscode-titlebar flex items-center select-none relative border-b border-[#2a2a2a] shrink-0">
        {/* Traffic lights placeholder area */}
        <div className="w-[72px] flex items-center gap-[6px] pl-[12px] shrink-0">
          <div className="w-[12px] h-[12px] rounded-full bg-[#ff5f57]" />
          <div className="w-[12px] h-[12px] rounded-full bg-[#febc2e]" />
          <div className="w-[12px] h-[12px] rounded-full bg-[#28c840]" />
        </div>

        {/* Menu bar */}
        <div ref={menuRef} className="flex items-center gap-0 relative z-[200]">
          {menus.map((menu) => (
            <div key={menu.label} className="relative">
              <div
                onClick={() => setOpenMenu(openMenu === menu.label ? null : menu.label)}
                onMouseEnter={() => { if (openMenu) setOpenMenu(menu.label); }}
                className={`px-2 h-[28px] flex items-center text-[13px] cursor-pointer select-none transition-colors ${
                  openMenu === menu.label ? "text-white bg-[#333333]" : "text-gray-300 bg-transparent hover:text-white"
                }`}
              >
                {menu.label}
              </div>
              {openMenu === menu.label && (
                <div className="absolute top-[28px] left-0 bg-ct-vscode-sidebar border border-[#454545] shadow-[0_4px_16px_rgba(0,0,0,0.6)] min-w-[220px] z-[9999] py-1">
                  {menu.items.map((item, i) => (
                    <div key={i}>
                      {item.divider && i > 0 && (
                        <div className="h-px bg-[#454545] my-1" />
                      )}
                      <div
                        onClick={() => { item.action?.(); setOpenMenu(null); }}
                        className="flex justify-between items-center px-[20px] py-1 text-[13px] cursor-pointer text-gray-300 hover:bg-[#333333] hover:text-white"
                      >
                        <span>{item.label}</span>
                        {item.shortcut && <span className="opacity-60 text-[12px] ml-6">{item.shortcut}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Center: breadcrumb / room name */}
        <div className="flex-1 flex items-center justify-center absolute left-0 right-0 pointer-events-none">
          <div className="flex items-center gap-[6px] text-[12px] text-gray-300 pointer-events-auto">
            <Code size={13} className="text-white" />
            <span className="text-white opacity-80 max-w-[300px] overflow-hidden text-ellipsis whitespace-nowrap">
              {getRoomDisplayName(roomName)}
            </span>
            <ChevronRight size={12} className="text-gray-500" />
            <span className="opacity-60">{language}</span>
          </div>
        </div>

        {/* Right: mic/cam/run/share/leave */}
        <div className="ml-auto flex items-center gap-[2px] pr-[8px] shrink-0">
          {/* Media controls */}
          <button
            onClick={onMicToggle}
            title={micOn ? "Mute" : "Unmute"}
            className={`w-6 h-6 rounded border-none cursor-pointer flex items-center justify-center transition-colors ${
              micOn ? "bg-green-500/15 text-green-500" : "bg-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            {micOn ? <Mic size={13} /> : <MicOff size={13} />}
          </button>
          <button
            onClick={onCameraToggle}
            title={cameraOn ? "Stop camera" : "Start camera"}
            className={`w-6 h-6 rounded border-none cursor-pointer flex items-center justify-center transition-colors ${
              cameraOn ? "bg-green-500/15 text-green-500" : "bg-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            {cameraOn ? <Video size={13} /> : <VideoOff size={13} />}
          </button>
          <button
            onClick={onScreenToggle}
            title={screenOn ? "Stop sharing" : "Share screen"}
            className={`w-6 h-6 rounded border-none cursor-pointer flex items-center justify-center transition-colors mr-[6px] ${
              screenOn ? "bg-white/20 text-gray-200" : "bg-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            <Monitor size={13} />
          </button>

          {/* Room code pill */}
          <div
            onClick={copyCode}
            title="Copy room code"
            className="flex items-center gap-[5px] px-[8px] py-[2px] bg-[#2d2d2d] border border-[#454545] rounded-[3px] cursor-pointer text-[11px] text-gray-300 mr-1 hover:border-gray-400 transition-colors"
          >
            <span className="opacity-50">🔑</span>
            <span className="font-mono tracking-wider">{roomCode || roomId.slice(0, 8)}</span>
            <Copy size={10} className="opacity-50" />
          </div>

          {/* Run */}
          <button
            onClick={onRunCode}
            className="flex items-center gap-[4px] px-[10px] py-[3px] bg-[#2ea043] border-none rounded-[3px] text-white text-[11px] font-semibold cursor-pointer hover:bg-[#2c973e] transition-colors"
          >
            <Play size={11} fill="white" /> Run
          </button>

          {/* Preview */}
          <button
            onClick={onPreview}
            disabled={!onPreview}
            className={`flex items-center gap-[4px] px-[10px] py-[3px] bg-white border-none rounded-[3px] text-black text-[11px] font-semibold transition-opacity ${
              onPreview ? "cursor-pointer hover:bg-gray-200 opacity-100" : "cursor-not-allowed opacity-50"
            }`}
          >
            <Eye size={11} fill="black" /> Preview
          </button>

          {/* Share */}
          <button
            onClick={copyLink}
            className="flex items-center gap-[4px] px-[10px] py-[3px] bg-[#454545] border-none rounded-[3px] text-white text-[11px] cursor-pointer ml-[3px] hover:bg-[#555] transition-colors"
          >
            <Share2 size={11} /> Share
          </button>

          {/* Leave */}
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-[4px] px-[10px] py-[3px] bg-[#e81123] border-none rounded-[3px] text-white text-[11px] cursor-pointer ml-[3px] hover:bg-[#c80f1e] transition-colors"
          >
            <LogOut size={11} /> Leave
          </button>
        </div>
      </div>
    </>
  );
}
