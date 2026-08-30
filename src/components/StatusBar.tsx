"use client";

import { GitBranch, Check, Users, Bell, RefreshCw, AlertTriangle, Radio, ExternalLink } from "lucide-react";

type StatusBarProps = {
  language: string;
  cursorLine: number;
  cursorColumn: number;
  syncStatus: "synced" | "syncing" | "saved" | "failed";
  participantCount: number;
  wordWrap: boolean;
  onWordWrapToggle: () => void;
  tabSize?: number;
  onSaveRetry?: () => void;
  isLiveServerOn?: boolean;
  onToggleLiveServer?: () => void;
  liveServerPort?: number;
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
  onSaveRetry,
  isLiveServerOn = false,
  onToggleLiveServer,
  liveServerPort = 5500,
}: StatusBarProps) {
  return (
    <div className="h-[22px] bg-ct-dark-black text-gray-200 border-t border-ct-subtle flex items-center justify-between px-2.5 text-xs z-[1000] select-none">
      <div className="flex items-center gap-3 h-full">
        <div className="flex items-center gap-1 h-full px-1 cursor-default hover:bg-white/10 transition-colors">
          <GitBranch size={14} />
          <span>main*</span>
        </div>
        
        <div
          onClick={() => { if (syncStatus === "failed") onSaveRetry?.(); }}
          className={`flex items-center gap-1 h-full px-1 transition-colors ${
            syncStatus === "failed"
              ? "text-red-400 font-semibold cursor-pointer hover:bg-red-500/10"
              : "cursor-default hover:bg-white/10"
          }`}
        >
          {syncStatus === "syncing" ? (
            <><RefreshCw size={13} className="animate-spin text-sky-400" /><span className="text-sky-300">Saving...</span></>
          ) : syncStatus === "failed" ? (
            <><AlertTriangle size={14} /><span>Save failed — click to retry</span></>
          ) : (
            <><Check size={14} className="text-emerald-400" /><span className={syncStatus === "saved" ? "text-emerald-300 font-medium" : ""}>{syncStatus === "saved" ? "Saved ✓" : "Synced"}</span></>
          )}
        </div>

        <div className="flex items-center gap-1 h-full px-1 cursor-default hover:bg-white/10 transition-colors">
          <Users size={14} />
          <span>{participantCount} {participantCount === 1 ? "Partner" : "Partners"}</span>
        </div>
      </div>

      <div className="flex items-center gap-3 h-full">
        {/* VS Code Style Live Server "Go Live" Button */}
        {onToggleLiveServer && (
          <div
            onClick={onToggleLiveServer}
            title={isLiveServerOn ? `Live Server active on Port ${liveServerPort} — click to open in browser` : "Click to run Live Server (Live Preview in browser)"}
            className={`flex items-center gap-1.5 h-full px-2 cursor-pointer transition-colors ${
              isLiveServerOn
                ? "bg-emerald-600/30 text-emerald-300 hover:bg-emerald-600/40 border-l border-r border-emerald-500/40 font-semibold"
                : "hover:bg-white/10 text-gray-300 hover:text-white"
            }`}
          >
            <Radio size={13} className={isLiveServerOn ? "text-emerald-400 animate-pulse" : "text-gray-400"} />
            <span>{isLiveServerOn ? `Port : ${liveServerPort}` : "Go Live"}</span>
            {isLiveServerOn && <ExternalLink size={10} className="text-emerald-300" />}
          </div>
        )}

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
