"use client";

import { GitBranch, Check, Users, Bell, RefreshCw } from "lucide-react";

type StatusBarProps = {
  language: string;
  cursorLine: number;
  cursorColumn: number;
  syncStatus: "synced" | "syncing" | "saved";
  participantCount: number;
  wordWrap: boolean;
  onWordWrapToggle: () => void;
  tabSize?: number;
};

export default function StatusBar({
  language,
  cursorLine,
  cursorColumn,
  syncStatus,
  participantCount,
  wordWrap,
  onWordWrapToggle,
  tabSize = 2,
}: StatusBarProps) {
  return (
    <div className="h-[22px] bg-ct-dark-black text-gray-200 border-t border-ct-subtle flex items-center justify-between px-2.5 text-xs z-[1000] select-none">
      <div className="flex items-center gap-3 h-full">
        <div className="flex items-center gap-1 h-full px-1 cursor-default hover:bg-white/10 transition-colors">
          <GitBranch size={14} />
          <span>main*</span>
        </div>
        
        <div className="flex items-center gap-1 h-full px-1 cursor-default hover:bg-white/10 transition-colors">
          {syncStatus === "syncing" ? <RefreshCw size={13} className="animate-spin" /> : <Check size={14} />}
          <span>{syncStatus === "syncing" ? "Syncing..." : "Synced"}</span>
        </div>

        <div className="flex items-center gap-1 h-full px-1 cursor-default hover:bg-white/10 transition-colors">
          <Users size={14} />
          <span>{participantCount} {participantCount === 1 ? "Partner" : "Partners"}</span>
        </div>
      </div>

      <div className="flex items-center gap-3 h-full">
        <div className="flex items-center h-full px-1 cursor-default hover:bg-white/10 transition-colors">Ln {cursorLine}, Col {cursorColumn}</div>
        <div className="flex items-center h-full px-1 cursor-default hover:bg-white/10 transition-colors">Spaces: {tabSize}</div>
        <div className="flex items-center h-full px-1 cursor-default hover:bg-white/10 transition-colors">UTF-8</div>
        <div onClick={onWordWrapToggle} className="flex items-center h-full px-1 cursor-pointer hover:bg-white/10 transition-colors">
          {wordWrap ? "Word Wrap: On" : "Word Wrap: Off"}
        </div>
        <div className="flex items-center h-full px-1 cursor-default font-semibold capitalize hover:bg-white/10 transition-colors">{language}</div>
        
        <div className="flex items-center h-full px-1 cursor-default hover:bg-white/10 transition-colors">
          <Bell size={14} />
        </div>
      </div>
    </div>
  );
}
