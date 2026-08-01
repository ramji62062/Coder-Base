"use client";

import { useState, useEffect } from "react";
import ChatPanel from "@/components/Chat";
import FileExplorer, { type FileItem } from "@/components/FileExplorer";
import DebugPanel from "@/components/DebugPanel";
import Whiteboard from "@/components/Whiteboard";
import AIAssistant from "@/components/AIAssistant";
import TeacherNotes from "@/components/TeacherNotes";
import SessionTimer from "@/components/SessionTimer";
import ParticipantsCallPanel from "@/components/ParticipantsCallPanel";
import { ChevronDown, ChevronRight } from "lucide-react";

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
    <div onClick={onToggle} style={{ height: 22, display: "flex", alignItems: "center", background: "#383838", padding: "0 4px", cursor: "pointer", borderTop: "1px solid #2b2b2b" }}>
      {isOpen ? <ChevronDown size={14} strokeWidth={2.5} /> : <ChevronRight size={14} strokeWidth={2.5} />}
      <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", marginLeft: 4, flex: 1, color: "#fff", letterSpacing: "0.05em" }}>{title}</span>
    </div>
  );
}

function SettingsPanel({ language, onLanguageChange, roomName, onRoomNameChange }: { language: string; onLanguageChange: (l: string) => void; roomName: string; onRoomNameChange: (n: string) => void }) {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <div>
      <SectionHeader title="Room Settings" isOpen={isOpen} onToggle={() => setIsOpen(!isOpen)} />
      {isOpen && (
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, color: "#999", display: "block", marginBottom: 4, fontWeight: 600 }}>ROOM NAME</label>
            <input value={roomName} onChange={(e) => onRoomNameChange(e.target.value)} style={{ width: "100%", background: "#3c3c3c", border: "1px solid #3c3c3c", borderRadius: 2, color: "#ccc", fontSize: 13, padding: "4px 6px", outline: "none", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#999", display: "block", marginBottom: 4, fontWeight: 600 }}>DEFAULT LANGUAGE</label>
            <select value={language} onChange={(e) => onLanguageChange(e.target.value)} style={{ width: "100%", background: "#3c3c3c", border: "1px solid #3c3c3c", borderRadius: 2, color: "#ccc", fontSize: 13, padding: "4px 6px", outline: "none", cursor: "pointer" }}>
              {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

const FULLSCREEN_PANELS = ["whiteboard", "ai", "notes", "timer"];

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
    return (
      <div style={{
        position: "absolute", top: 0, left: 48, right: 0, bottom: 0,
        zIndex: 80, display: "flex", flexDirection: "column", overflow: "hidden"
      }}>
        <div style={{
          height: 35, background: "#252526", borderBottom: "1px solid #2b2b2b",
          display: "flex", alignItems: "center", padding: "0 16px",
          justifyContent: "space-between"
        }}>
          <span style={{ fontSize: 11, color: "#bbb", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {props.activePanel === "ai" ? "AI Code Assistant" :
             props.activePanel === "whiteboard" ? "Whiteboard" :
             props.activePanel === "notes" ? "Teacher Notes" :
             "Session Timer"}
          </span>
          <button onClick={() => props.onPanelChange("none")}
            style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>
            ✕
          </button>
        </div>
        <div style={{ flex: 1, overflow: "hidden" }}>
          {props.activePanel === "whiteboard" && <Whiteboard roomId={props.roomId} currentUserId={props.currentUserId} />}
          {props.activePanel === "ai" && <AIAssistant currentCode={props.currentCode || ""} language={props.language} />}
          {props.activePanel === "notes" && <TeacherNotes roomId={props.roomId} currentUserId={props.currentUserId} currentUserName={props.currentUserName} isTeacher={props.isTeacher} />}
          {props.activePanel === "timer" && <SessionTimer isTeacher={props.isTeacher} onSaveWork={props.onSaveWork} onSessionEnd={props.onSessionEnd} roomId={props.roomId} currentUserId={props.currentUserId} />}
        </div>
      </div>
    );
  }

  // Participants panel gets a wider sidebar and special treatment
  const isParticipants = props.activePanel === "participants";
  const sidebarWidth = isParticipants ? 280 : 260;
  const showSidebar = props.activePanel !== "none";
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
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#252526",
        overflow: props.isFullscreen ? "visible" : "hidden"
      }}
    >
      {showSidebar && !isParticipants && (
        <div style={{ height: 35, display: "flex", alignItems: "center", padding: "0 12px 0 20px", color: "#bbb", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, borderBottom: "1px solid #2b2b2b", justifyContent: "space-between" }}>
          <span>
            {props.activePanel === "files" ? "Explorer" :
             props.activePanel === "debug" ? "Run and Debug" :
             props.activePanel === "chat" ? "Collaboration Chat" :
             "Settings"}
          </span>
        </div>
      )}

      <div style={{
        flex: 1,
        overflowY: props.isFullscreen ? "visible" : "auto",
        overflowX: "hidden",
        display: "flex",
        flexDirection: "column"
      }}>
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
        
        {/* Render ParticipantsCallPanel always to keep connection alive, hide it when not active and not in fullscreen */}
        <div style={{
          display: props.activePanel === "participants" || props.isFullscreen ? "flex" : "none",
          flexDirection: "column",
          height: "100%"
        }}>
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
        {props.activePanel === "chat" && <ChatPanel roomId={props.roomId} currentUserId={props.currentUserId} currentUserName={props.currentUserName} onNewMessage={props.onNewChatMessage} />}
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
          <div style={{ position: "fixed", inset: 0, background: "#000a", zIndex: 49 }} onClick={() => props.onPanelChange("none")} />
        )}
        <div style={{
          position: "fixed", top: 0, left: 0, bottom: 0,
          width: showSidebar ? sidebarWidth : 0,
          zIndex: 50,
          boxShadow: showSidebar ? "4px 0 20px #0008" : "none",
          overflow: props.isFullscreen ? "visible" : "hidden",
          pointerEvents: showSidebar || props.isFullscreen ? "auto" : "none"
        }}>
          {panelContent}
        </div>
      </>
    );
  }

  return (
    <div style={{
      width: actualWidth,
      minWidth: actualWidth,
      borderRight: showSidebar ? "1px solid #2b2b2b" : "none",
      position: "relative",
      overflow: props.isFullscreen ? "visible" : "hidden",
      transition: "width 0.2s, min-width 0.2s"
    }}>
      {panelContent}
    </div>
  );
}
