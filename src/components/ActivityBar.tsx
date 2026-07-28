"use client";

import { Files, Mail, Settings, UserCircle, PenTool, Sparkles, BookOpen, Clock, Bug, Users, Monitor } from "lucide-react";
import { getInitials } from "@/lib/utils";

type ActivityBarProps = {
  activePanel: string;
  onPanelChange: (panel: string) => void;
  unreadChat?: number;
  participantCount?: number;
  userAvatar?: string | null;
  userName?: string;
  onProfileClick?: () => void;
  onScreenShareClick?: () => void;
};

export default function ActivityBar({ activePanel, onPanelChange, unreadChat = 0, participantCount = 0, userAvatar, userName = "User", onProfileClick, onScreenShareClick }: ActivityBarProps) {
  const topItems = [
    { id: "files", icon: <Files size={22} />, label: "Explorer" },
    { id: "participants", icon: <Users size={22} />, label: "Participants & Video Call", badge: participantCount, badgeColor: "#22c55e" },
    { id: "debug", icon: <Bug size={22} />, label: "Debug & Breakpoints" },
    { id: "chat", icon: <Mail size={22} />, label: "Chat", badge: unreadChat, badgeColor: "#7C3AED" },
    { id: "whiteboard", icon: <PenTool size={22} />, label: "Whiteboard" },
    { id: "ai", icon: <Sparkles size={22} />, label: "AI Assistant" },
    { id: "notes", icon: <BookOpen size={22} />, label: "Teacher Notes" },
    { id: "timer", icon: <Clock size={22} />, label: "Session Timer" },
    { id: "screenshare", icon: <Monitor size={22} />, label: "Share Screen" },
  ];

  const bottomItems = [
    { id: "settings", icon: <Settings size={22} />, label: "Settings" },
  ];

  const Item = ({ item }: { item: typeof topItems[0] }) => {
    const isActive = activePanel === item.id;
    return (
      <div
        onClick={() => {
          if (item.id === "screenshare") {
            if (onScreenShareClick) onScreenShareClick();
            return;
          }
          if (item.id === "profile") {
            if (onProfileClick) onProfileClick();
            return;
          }
          onPanelChange(isActive ? "none" : item.id);
        }}
        title={item.label}
        style={{
          height: 44, width: "100%", display: "flex", alignItems: "center",
          justifyContent: "center", cursor: "pointer",
          color: isActive ? "#ffffff" : "#666", position: "relative",
          transition: "color 0.2s",
          background: isActive ? "rgba(124,58,237,0.12)" : "transparent",
        }}
        onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.color = "#ccc"; }}
        onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.color = "#666"; }}
      >
        {isActive && (
          <div style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", width: 2, height: 28, background: "#7C3AED", borderRadius: "0 2px 2px 0" }} />
        )}
        {item.icon}
        {"badge" in item && (item as any).badge > 0 && (
          <div style={{ position: "absolute", bottom: 8, right: 8, background: (item as any).badgeColor || "#7C3AED", color: "white", fontSize: 9, borderRadius: "50%", width: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold" }}>
            {(item as any).badge}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ width: 48, background: "#1e1e1e", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", padding: "4px 0", zIndex: 100, borderRight: "1px solid #2b2b2b" }}>
      <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
        {topItems.map((item) => <Item key={item.id} item={item} />)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", width: "100%", gap: "8px" }}>
        {bottomItems.map((item) => <Item key={item.id} item={item} />)}
        <div
          onClick={() => onProfileClick && onProfileClick()}
          title="User Profile"
          style={{
            height: 44, width: "100%", display: "flex", alignItems: "center",
            justifyContent: "center", cursor: "pointer",
            marginBottom: "8px"
          }}
        >
          {userAvatar ? (
            <img src={userAvatar} alt="Profile" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} />
          ) : (
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,#7C3AED,#60a5fa)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: "bold", color: "#fff" }}>
              {getInitials(userName)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
