"use client";

import { useState, useEffect, useRef } from "react";
import ChatPanel from "@/components/Chat";
import FileExplorer, { type FileItem } from "@/components/FileExplorer";
import DebugPanel from "@/components/DebugPanel";
import Whiteboard from "@/components/Whiteboard";
import AIAssistant from "@/components/AIAssistant";
import TeacherNotes from "@/components/TeacherNotes";
import SessionTimer from "@/components/SessionTimer";
import ParticipantsCallPanel from "@/components/ParticipantsCallPanel";
import { ChevronDown, ChevronRight, Mic, MicOff, Video, VideoOff, PhoneOff, Users, GripHorizontal, Maximize2, Minus } from "lucide-react";

type PresenceMember = { userId: string; name: string; avatar?: string | null };
type Breakpoint = { file: string; line: number };

type LeftSidebarProps = {
  activePanel: string;
  onPanelChange: (panel: string) => void;
  members: PresenceMember[];
  roomId: string;
  currentUserId: string;
  currentUserName: string;
  language: string;
  onLanguageChange: (lang: string) => void;
  roomName: string;
  onRoomNameChange: (name: string) => void;
  onNewChatMessage?: () => void;
  files: FileItem[];
  activeFile: string;
  openFileNames?: string[];
  onFileSelect: (name: string) => void;
  expandedFolders?: string[];
  onFolderToggle?: (path: string, expanded: boolean) => void;
  onFileCreate: (file: FileItem) => void;
  onFileDelete: (name: string) => void;
  onFileRename: (oldName: string, newName: string) => void;
  onOpenProject?: () => void;
  onSaveProject?: () => void;
  projectName?: string;
  breakpoints: Breakpoint[];
  onClearBreakpoints: () => void;
  onRemoveBreakpoint: (file: string, line: number) => void;
  currentCode?: string;
  isTeacher?: boolean;
  onSaveWork?: () => void;
  onSessionEnd?: () => void;
  // Video call props
  micOn?: boolean;
  cameraOn?: boolean;
  screenOn?: boolean;
  isFullscreen: boolean;
  onFullscreenChange: (val: boolean) => void;
  onMicToggle?: (val?: boolean) => void;
  onCameraToggle?: (val?: boolean) => void;
  onScreenToggle?: (val?: boolean) => void;
  onAddToast?: (msg: string, type?: "info" | "error" | "success") => void;
  hostUserId?: string;
  isCallJoined?: boolean;
  onCallJoinedChange?: (val: boolean) => void;
  onApplyCode?: (code: string, fileName?: string) => void;
};

const LANGUAGES = ["javascript", "typescript", "python", "java", "cpp", "c", "go", "rust", "html", "css", "shell", "php", "ruby", "csharp", "kotlin", "swift", "r", "lua"];

function getLangFromExt(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
    py: "python", java: "java", cpp: "cpp", cc: "cpp", cxx: "cpp", c: "c",
    cs: "csharp", go: "go", rs: "rust", php: "php", rb: "ruby", kt: "kotlin",
    kts: "kotlin", swift: "swift", scala: "scala", pl: "perl", r: "r", lua: "lua",
    dart: "dart", sh: "shell", bash: "shell", html: "html", css: "css", md: "markdown"
  };
  return map[ext] || "javascript";
}

function SectionHeader({ title, isOpen, onToggle }: { title: string; isOpen: boolean; onToggle: () => void }) {
  return (
    <div onClick={onToggle} className="h-[22px] flex items-center bg-[#383838] px-1 cursor-pointer border-t border-[#2b2b2b]">
      {isOpen ? <ChevronDown size={14} strokeWidth={2.5} className="text-white" /> : <ChevronRight size={14} strokeWidth={2.5} className="text-white" />}
      <span className="text-[11px] font-bold uppercase ml-1 flex-1 text-white tracking-wider">{title}</span>
    </div>
  );
}

function SettingsPanel({ language, onLanguageChange, roomName, onRoomNameChange }: { language: string; onLanguageChange: (l: string) => void; roomName: string; onRoomNameChange: (n: string) => void }) {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <div>
      <SectionHeader title="Room Settings" isOpen={isOpen} onToggle={() => setIsOpen(!isOpen)} />
      {isOpen && (
        <div className="p-[12px_16px] flex flex-col gap-3">
          <div>
            <label className="text-[11px] text-gray-400 block mb-1 font-semibold">ROOM NAME</label>
            <input value={roomName} onChange={(e) => onRoomNameChange(e.target.value)} className="w-full bg-[#3c3c3c] border border-[#3c3c3c] rounded-sm text-gray-200 text-xs p-[4px_6px] outline-none box-border focus:border-white transition-colors" />
          </div>
          <div>
            <label className="text-[11px] text-gray-400 block mb-1 font-semibold">DEFAULT LANGUAGE</label>
            <select value={language} onChange={(e) => onLanguageChange(e.target.value)} className="w-full bg-[#3c3c3c] border border-[#3c3c3c] rounded-sm text-gray-200 text-xs p-[4px_6px] outline-none cursor-pointer">
              {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

const FULLSCREEN_PANELS = ["whiteboard", "ai", "notes", "timer"];

type FloatingCallWindowProps = {
  isCallJoined: boolean;
  micOn: boolean;
  cameraOn: boolean;
  totalInCall: number;
  onMicToggle: () => void;
  onCameraToggle: () => void;
  onLeaveCall: () => void;
  onShowParticipants: () => void;
  currentUserName: string;
};

function FloatingCallWindow({
  isCallJoined, micOn, cameraOn, totalInCall,
  onMicToggle, onCameraToggle, onLeaveCall, onShowParticipants, currentUserName
}: FloatingCallWindowProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [pos, setPos] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, startPosX: 0, startPosY: 0 });

  useEffect(() => {
    if (typeof window !== "undefined") {
      setPos({ x: window.innerWidth - 200, y: window.innerHeight - 100 });
    }
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isMinimized) return;
    e.preventDefault();
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: pos.x,
      startPosY: pos.y,
    };

    const handleMouseMove = (me: MouseEvent) => {
      const dx = me.clientX - dragRef.current.startX;
      const dy = me.clientY - dragRef.current.startY;
      setPos({
        x: Math.max(10, Math.min(window.innerWidth - 280, dragRef.current.startPosX + dx)),
        y: Math.max(10, Math.min(window.innerHeight - 60, dragRef.current.startPosY + dy)),
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  if (!isCallJoined) return null;

  if (isMinimized) {
    return (
      <div
        style={{
          position: "fixed",
          left: pos.x,
          top: pos.y,
          zIndex: 999999,
          background: "rgba(18, 18, 26, 0.95)",
          border: "1px solid rgba(124, 58, 237, 0.4)",
          borderRadius: 24,
          padding: "6px 14px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          boxShadow: "0 12px 32px rgba(0,0,0,0.75), 0 0 20px rgba(124,58,237,0.25)",
          backdropFilter: "blur(16px)",
          cursor: "move",
          userSelect: "none",
        }}
        onMouseDown={handleMouseDown}
      >
        <GripHorizontal size={14} color="#94a3b8" style={{ cursor: "grab" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{
            width: 26, height: 26, borderRadius: "50%",
            background: "linear-gradient(135deg,#7C3AED,#5b21b6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 10, fontWeight: 700,
            border: micOn ? "2px solid #22c55e" : "1px solid #444"
          }}>
            {currentUserName.slice(0, 2).toUpperCase()}
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>Call</span>
          <span style={{ fontSize: 10, background: "#7C3AED33", color: "#c4b5fd", padding: "1px 6px", borderRadius: 10, display: "flex", alignItems: "center", gap: 3 }}>
            <Users size={10} /> {totalInCall}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 4 }}>
          <button onClick={(e) => { e.stopPropagation(); onMicToggle(); }}
            title={micOn ? "Mute" : "Unmute"}
            style={{
              background: micOn ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
              border: micOn ? "1px solid #22c55e" : "1px solid #ef4444",
              borderRadius: 12, padding: "4px 8px",
              color: micOn ? "#22c55e" : "#ef4444", cursor: "pointer",
              display: "flex", alignItems: "center",
            }}>
            {micOn ? <Mic size={12} /> : <MicOff size={12} />}
          </button>
          <button onClick={(e) => { e.stopPropagation(); onCameraToggle(); }}
            title={cameraOn ? "Stop Video" : "Start Video"}
            style={{
              background: cameraOn ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
              border: cameraOn ? "1px solid #22c55e" : "1px solid #ef4444",
              borderRadius: 12, padding: "4px 8px",
              color: cameraOn ? "#22c55e" : "#ef4444", cursor: "pointer",
              display: "flex", alignItems: "center",
            }}>
            {cameraOn ? <Video size={12} /> : <VideoOff size={12} />}
          </button>
          <button onClick={(e) => { e.stopPropagation(); setIsMinimized(false); }}
            title="Expand call window"
            style={{
              background: "rgba(124, 58, 237, 0.2)",
              border: "1px solid #7C3AED", borderRadius: 12, padding: "4px 8px",
              color: "#c4b5fd", cursor: "pointer", display: "flex", alignItems: "center",
            }}>
            <Maximize2 size={12} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onLeaveCall(); }}
            title="Leave call"
            style={{
              background: "#ea4335", border: "none", borderRadius: 12, padding: "4px 8px",
              color: "#fff", cursor: "pointer", display: "flex", alignItems: "center",
            }}>
            <PhoneOff size={12} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        width: 280,
        zIndex: 999999,
        background: "rgba(10, 10, 13, 0.98)",
        border: "1px solid rgba(124, 58, 237, 0.4)",
        borderRadius: 12,
        boxShadow: "0 24px 64px rgba(0,0,0,0.85), 0 0 24px rgba(124,58,237,0.2)",
        backdropFilter: "blur(16px)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          height: 32,
          background: "rgba(18, 18, 26, 0.95)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          padding: "0 10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: isDragging ? "grabbing" : "move",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <GripHorizontal size={12} color="#94a3b8" />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#f8fafc" }}>
            Call ({totalInCall})
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            onClick={() => setIsMinimized(true)}
            title="Minimize"
            style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", display: "flex", padding: 3, borderRadius: 4 }}
          >
            <Minus size={13} />
          </button>
          <button
            onClick={onShowParticipants}
            title="Show participants panel"
            style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", display: "flex", padding: 3, borderRadius: 4 }}
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>

      {/* Controls */}
      <div style={{ padding: "10px 12px", display: "flex", gap: 6, justifyContent: "center", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <button onClick={onMicToggle} title={micOn ? "Mute" : "Unmute"}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 40, height: 40, borderRadius: "50%",
            background: micOn ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
            border: micOn ? "1px solid #22c55e" : "1px solid #ef4444",
            color: micOn ? "#22c55e" : "#ef4444", cursor: "pointer",
          }}>
          {micOn ? <Mic size={18} /> : <MicOff size={18} />}
        </button>
        <button onClick={onCameraToggle} title={cameraOn ? "Stop Video" : "Start Video"}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 40, height: 40, borderRadius: "50%",
            background: cameraOn ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
            border: cameraOn ? "1px solid #22c55e" : "1px solid #ef4444",
            color: cameraOn ? "#22c55e" : "#ef4444", cursor: "pointer",
          }}>
          {cameraOn ? <Video size={18} /> : <VideoOff size={18} />}
        </button>
        <button onClick={onLeaveCall} title="Leave call"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 40, height: 40, borderRadius: "50%",
            background: "#ea4335", border: "none",
            color: "#fff", cursor: "pointer",
          }}>
          <PhoneOff size={18} />
        </button>
      </div>

      {/* Info */}
      <div style={{ padding: "8px 12px", fontSize: 11, color: "#888", textAlign: "center" }}>
        Call continues in background
      </div>
    </div>
  );
}

export default function LeftSidebar(props: LeftSidebarProps) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const isFullscreenPanel = FULLSCREEN_PANELS.includes(props.activePanel);

  if (isFullscreenPanel) {
    const isAi = props.activePanel === "ai";
    return (
      <>
        <div className={`absolute top-0 left-[48px] right-0 bottom-0 z-[80] flex flex-col overflow-hidden ${isAi ? "bg-black" : ""}`}>
          <div className={`h-[35px] border-b border-[#2b2b2b] flex items-center px-4 justify-between ${isAi ? "bg-black" : "bg-ct-vscode-sidebar"}`}>
            <span className={`text-[11px] uppercase tracking-wider font-bold ${isAi ? "text-white" : "text-gray-300"}`}>
              {props.activePanel === "ai" ? "AI Code Assistant" :
               props.activePanel === "whiteboard" ? "Whiteboard" :
               props.activePanel === "notes" ? "Teacher Notes" :
               "Session Timer"}
            </span>
            <button onClick={() => props.onPanelChange("none")}
              className="bg-transparent border-none text-gray-400 cursor-pointer text-base hover:text-white transition-colors">
              ✕
            </button>
          </div>
          <div className={`flex-1 overflow-hidden ${isAi ? "bg-black" : ""}`}>
            {props.activePanel === "whiteboard" && <Whiteboard roomId={props.roomId} currentUserId={props.currentUserId} />}
            {props.activePanel === "ai" && (
              <AIAssistant
                roomId={props.roomId}
                currentUserId={props.currentUserId}
                currentCode={props.currentCode || ""}
                language={props.language}
                files={props.files}
                activeFile={props.activeFile}
                onFileCreate={(name, content) => props.onFileCreate({ name, content, language: getLangFromExt(name) })}
                onApplyCode={props.onApplyCode}
                onPanelChange={props.onPanelChange}
              />
            )}
            {props.activePanel === "notes" && <TeacherNotes roomId={props.roomId} currentUserId={props.currentUserId} currentUserName={props.currentUserName} isTeacher={props.isTeacher} />}
            {props.activePanel === "timer" && <SessionTimer isTeacher={props.isTeacher} onSaveWork={props.onSaveWork} onSessionEnd={props.onSessionEnd} roomId={props.roomId} currentUserId={props.currentUserId} />}
          </div>
        </div>
        <FloatingCallWindow
          isCallJoined={props.isCallJoined ?? false}
          micOn={props.micOn ?? false}
          cameraOn={props.cameraOn ?? false}
          totalInCall={props.members.length}
          onMicToggle={() => props.onMicToggle?.()}
          onCameraToggle={() => props.onCameraToggle?.()}
          onLeaveCall={() => {
            props.onCallJoinedChange?.(false);
            props.onMicToggle?.(false);
            props.onCameraToggle?.(false);
          }}
          onShowParticipants={() => props.onPanelChange("participants")}
          currentUserName={props.currentUserName}
        />
      </>
    );
  }

  const isParticipants = props.activePanel === "participants";
  const showSidebar = props.activePanel !== "none";
  const sidebarWidth = isParticipants ? 280 : 260;
  const actualWidth = showSidebar ? sidebarWidth : 0;

  const panelContent = (
    <div
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onDrop={(e) => {
        e.preventDefault(); e.stopPropagation();
        Array.from(e.dataTransfer.files).forEach((file) => {
          const reader = new FileReader();
          reader.onload = (ev) => {
            props.onFileCreate({ name: file.name, content: (ev.target?.result as string) || "", language: getLangFromExt(file.name) });
          };
          reader.readAsText(file);
        });
      }}
      className={`flex flex-col h-full bg-ct-vscode-sidebar ${props.isFullscreen ? "overflow-visible" : "overflow-hidden"}`}
    >
      {showSidebar && !isParticipants && (
        <div className="h-[35px] flex items-center pr-3 pl-5 text-gray-300 text-[11px] uppercase tracking-wider font-bold border-b border-[#2b2b2b] justify-between">
          <span>
            {props.activePanel === "files" ? "Explorer" :
             props.activePanel === "debug" ? "Run and Debug" :
             props.activePanel === "chat" ? "Collaboration Chat" :
             "Settings"}
          </span>
        </div>
      )}

      <div className={`flex-1 ${props.isFullscreen ? "overflow-visible" : "overflow-y-auto overflow-x-hidden"} flex flex-col`}>
        {props.activePanel === "files" && (
          <FileExplorer
            files={props.files}
            activeFile={props.activeFile}
            openFileNames={props.openFileNames}
            expandedFolders={props.expandedFolders}
            onFolderToggle={props.onFolderToggle}
            onFileSelect={props.onFileSelect}
            onFileCreate={props.onFileCreate}
            onFileDelete={props.onFileDelete}
            onFileRename={props.onFileRename}
            onOpenProject={props.onOpenProject}
            onSaveProject={props.onSaveProject}
            projectName={props.projectName}
          />
        )}
        
        <div className={`flex flex-col h-full ${props.isFullscreen ? "overflow-visible" : "overflow-hidden"}`}>
          <ParticipantsCallPanel
            members={props.members}
            currentUserId={props.currentUserId}
            currentUserName={props.currentUserName}
            roomId={props.roomId}
            micOn={props.micOn ?? false}
            cameraOn={props.cameraOn ?? false}
            screenOn={props.screenOn ?? false}
            isFullscreen={props.isFullscreen}
            onFullscreenChange={props.onFullscreenChange}
            onMicToggle={props.onMicToggle ?? (() => {})}
            onCameraToggle={props.onCameraToggle ?? (() => {})}
            onScreenToggle={props.onScreenToggle ?? (() => {})}
            isHost={props.isTeacher}
            hostUserId={props.hostUserId}
            onAddToast={props.onAddToast}
            isCallJoined={props.isCallJoined ?? false}
            onCallJoinedChange={props.onCallJoinedChange ?? (() => {})}
          />
        </div>

        {props.activePanel === "debug" && (
          <DebugPanel
            breakpoints={props.breakpoints}
            onClearBreakpoints={props.onClearBreakpoints}
            onRemoveBreakpoint={props.onRemoveBreakpoint}
            currentCode={props.currentCode}
            language={props.language}
            activeFile={props.activeFile}
          />
        )}
        <ChatPanel
          roomId={props.roomId}
          currentUserId={props.currentUserId}
          currentUserName={props.currentUserName}
          members={props.members}
          onNewMessage={props.onNewChatMessage}
          isDocked={props.activePanel === "chat"}
        />
        {props.activePanel === "settings" && (
          <SettingsPanel language={props.language} onLanguageChange={props.onLanguageChange} roomName={props.roomName} onRoomNameChange={props.onRoomNameChange} />
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <>
        {showSidebar && (
          <div className="fixed inset-0 bg-ct-dark-black/80 z-[49]" onClick={() => props.onPanelChange("none")} />
        )}
        <div style={{ width: showSidebar ? sidebarWidth : 0 }} className={`fixed top-0 left-0 bottom-0 z-[50] ${
          showSidebar ? "shadow-2xl" : ""
        } ${props.isFullscreen ? "overflow-visible" : "overflow-hidden"} ${
          showSidebar || props.isFullscreen ? "pointer-events-auto" : "pointer-events-none"
        }`}>
          {panelContent}
        </div>
      </>
    );
  }

  return (
    <div style={{ width: actualWidth, minWidth: actualWidth }} className={`relative border-r transition-all duration-200 ${
      showSidebar ? "border-[#2b2b2b]" : "border-transparent"
    } ${props.isFullscreen ? "overflow-visible" : "overflow-hidden"}`}>
      {panelContent}
    </div>
  );
}
