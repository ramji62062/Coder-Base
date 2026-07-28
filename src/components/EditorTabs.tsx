"use client";

import { X } from "lucide-react";

type TabItem = {
  name: string;
  modified: boolean;
};

type EditorTabsProps = {
  tabs: TabItem[];
  activeTab: string;
  onTabSelect: (name: string) => void;
  onTabClose: (name: string) => void;
};

// VS Code file icon colors by extension
const LANG_COLORS: Record<string, string> = {
  js: "#e8d44d",
  jsx: "#61dafb",
  ts: "#3178c6",
  tsx: "#61dafb",
  py: "#3572a5",
  java: "#b07219",
  cpp: "#f34b7d",
  go: "#00add8",
  rs: "#dea584",
  html: "#e44b23",
  css: "#563d7c",
  json: "#cbcb41",
  md: "#083fa1",
};

const LANG_LABELS: Record<string, string> = {
  js: "JS", jsx: "JSX", ts: "TS", tsx: "TSX",
  py: "PY", java: "☕", cpp: "C++", go: "GO",
  rs: "RS", html: "HTML", css: "CSS", json: "{}",
  md: "MD",
};

function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const color = LANG_COLORS[ext] || "#cccccc";
  const label = LANG_LABELS[ext] || ext.toUpperCase().slice(0, 3);
  return (
    <div style={{
      width: 16, height: 16, borderRadius: 2, background: color,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 7, fontWeight: 800, color: "#111", flexShrink: 0,
      letterSpacing: "-0.5px",
    }}>
      {label.slice(0, 2)}
    </div>
  );
}

function shortName(fullPath: string) {
  return fullPath.split("/").pop() || fullPath;
}

export default function EditorTabs({ tabs, activeTab, onTabSelect, onTabClose }: EditorTabsProps) {
  if (tabs.length === 0) return null;

  return (
    <div style={{
      display: "flex",
      flexDirection: "row",
      background: "#2d2d30",
      borderBottom: "1px solid #252526",
      overflowX: "auto",
      overflowY: "hidden",
      flexShrink: 0,
      height: 35,
      scrollbarWidth: "none",
    }}>
      {tabs.map((tab) => {
        const isActive = tab.name === activeTab;
        return (
          <div
            key={tab.name}
            onClick={() => onTabSelect(tab.name)}
            onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); onTabClose(tab.name); } }}
            title={tab.name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "0 10px",
              minWidth: 80,
              maxWidth: 200,
              height: 35,
              cursor: "pointer",
              fontSize: 13,
              color: isActive ? "#fff" : "#969696",
              borderRight: "1px solid #252526",
              background: isActive ? "#1e1e1e" : "#2d2d30",
              whiteSpace: "nowrap",
              flexShrink: 0,
              position: "relative",
              userSelect: "none",
              transition: "color 0.1s",
            }}
            onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.color = "#ccc"; }}
            onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.color = "#969696"; }}
          >
            {/* Active top border */}
            {isActive && (
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "#007acc" }} />
            )}

            <FileIcon name={tab.name} />

            <span style={{
              overflow: "hidden", textOverflow: "ellipsis", flex: 1, fontSize: 13,
            }}>
              {shortName(tab.name)}
            </span>

            {tab.modified ? (
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#e8c24a", flexShrink: 0 }} />
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); onTabClose(tab.name); }}
                title="Close"
                style={{
                  background: "none", border: "none", color: "#969696", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 18, height: 18, borderRadius: 3, flexShrink: 0, padding: 0,
                  opacity: 0,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#555"; (e.currentTarget as HTMLElement).style.color = "#fff"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "none"; (e.currentTarget as HTMLElement).style.color = "#969696"; }}
                ref={(el) => {
                  if (el) {
                    const parent = el.closest("[data-tab]") || el.parentElement;
                    // Show close on parent hover handled via CSS
                  }
                }}
              >
                <X size={12} />
              </button>
            )}
          </div>
        );
      })}

      <style>{`
        div[data-rttab]:hover > button { opacity: 1 !important; }
      `}</style>
    </div>
  );
}
