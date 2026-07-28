"use client";

import { GitBranch, Radio, Check, Users, Info, Bell, AlertCircle, RefreshCw } from "lucide-react";

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
    <div style={{
      height: 22,
      background: "#007acc",
      color: "#ffffff",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 10px",
      fontSize: 12,
      zIndex: 1000,
      userSelect: "none"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, height: "100%" }}>
        <div className="status-item" style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <GitBranch size={14} />
          <span>main*</span>
        </div>
        
        <div className="status-item" style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {syncStatus === "syncing" ? <RefreshCw size={13} className="spin" /> : <Check size={14} />}
          <span>{syncStatus === "syncing" ? "Syncing..." : "Synced"}</span>
        </div>

        <div className="status-item" style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Users size={14} />
          <span>{participantCount} {participantCount === 1 ? "Partner" : "Partners"}</span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, height: "100%" }}>
        <div className="status-item">Ln {cursorLine}, Col {cursorColumn}</div>
        <div className="status-item">Spaces: {tabSize}</div>
        <div className="status-item">UTF-8</div>
        <div className="status-item" onClick={onWordWrapToggle} style={{ cursor: "pointer" }}>
          {wordWrap ? "Word Wrap: On" : "Word Wrap: Off"}
        </div>
        <div className="status-item" style={{ fontWeight: 600, textTransform: "capitalize" }}>{language}</div>
        
        <div className="status-item" style={{ padding: "0 4px" }}>
          <Bell size={14} />
        </div>
      </div>

      <style jsx>{`
        .status-item {
          display: flex;
          align-items: center;
          height: 100%;
          padding: 0 4px;
          cursor: default;
          transition: background 0.1s;
        }
        .status-item:hover {
          background: rgba(255, 255, 255, 0.15);
        }
      `}</style>
    </div>
  );
}
