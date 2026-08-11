"use client";

import { Files, Mail, Settings, PenTool, Sparkles, BookOpen, Clock, Bug, Users, Monitor, LucideIcon } from "lucide-react";
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

type ActivityItem = {
  id: string;
  icon: LucideIcon;
  label: string;
  badge?: number;
};

export default function ActivityBar({ activePanel, onPanelChange, unreadChat = 0, participantCount = 0, userAvatar, userName = "User", onProfileClick, onScreenShareClick }: ActivityBarProps) {
  const topItems: ActivityItem[] = [
    { id: "files", icon: Files, label: "Explorer" },
    { id: "participants", icon: Users, label: "Participants & Video Call", badge: participantCount },
    { id: "debug", icon: Bug, label: "Debug & Breakpoints" },
    { id: "chat", icon: Mail, label: "Chat", badge: unreadChat },
    { id: "whiteboard", icon: PenTool, label: "Whiteboard" },
    { id: "ai", icon: Sparkles, label: "AI Assistant" },
    { id: "notes", icon: BookOpen, label: "Teacher Notes" },
    { id: "timer", icon: Clock, label: "Session Timer" },
    { id: "screenshare", icon: Monitor, label: "Share Screen" },
  ];

  const bottomItems: ActivityItem[] = [
    { id: "settings", icon: Settings, label: "Settings" },
  ];

  const Item = ({ item }: { item: ActivityItem }) => {
    const isActive = activePanel === item.id;
    const Icon = item.icon;
    const iconColor = isActive ? "#ffffff" : "#a7a7a7";

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
        className={`h-[44px] w-full flex items-center justify-center cursor-pointer relative transition-colors ${
          isActive ? "bg-white/10" : "hover:bg-white/5"
        }`}
      >
        {isActive && (
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-[28px] rounded-r"
            style={{ backgroundColor: "#ffffff" }}
          />
        )}
        <Icon
          size={22}
          className={isActive ? "activity-icon-active" : "activity-icon-idle"}
          style={{ color: iconColor }}
          strokeWidth={isActive ? 2.4 : 1.9}
        />
        {item.badge !== undefined && item.badge > 0 && (
          <div
            className="absolute bottom-2 right-2 text-[9px] rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold text-black bg-white"
          >
            {item.badge}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-[48px] bg-ct-vscode-bg flex flex-col items-center justify-between py-1 z-[100] border-r border-[#2b2b2b]">
      <div className="flex flex-col w-full">
        {topItems.map((item) => <Item key={item.id} item={item} />)}
      </div>
      <div className="flex flex-col w-full gap-2">
        {bottomItems.map((item) => <Item key={item.id} item={item} />)}
        <div
          onClick={() => onProfileClick && onProfileClick()}
          title="User Profile"
          className="h-[44px] w-full flex items-center justify-center cursor-pointer mb-2"
        >
          {userAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={userAvatar} alt="Profile" className="w-7 h-7 rounded-full object-cover ring-1 ring-white/20" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center text-[11px] font-bold text-black shadow-[0_0_16px_rgba(255,255,255,0.18)]">
              {getInitials(userName)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
