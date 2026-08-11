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

const LANG_LABELS: Record<string, string> = {
  js: "JS", jsx: "JSX", ts: "TS", tsx: "TSX",
  py: "PY", java: "☕", cpp: "C++", go: "GO",
  rs: "RS", html: "HTML", css: "CSS", json: "{}",
  md: "MD",
};

function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const label = LANG_LABELS[ext] || ext.toUpperCase().slice(0, 3);
  return (
    <div className="w-4 h-4 rounded-xs bg-white/20 text-white flex items-center justify-center text-[7px] font-extrabold shrink-0 tracking-tight">
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
    <div className="flex flex-row bg-ct-vscode-tabs border-b border-[#252526] overflow-x-auto overflow-y-hidden shrink-0 h-[35px] select-none text-gray-200">
      {tabs.map((tab) => {
        const isActive = tab.name === activeTab;
        return (
          <div
            key={tab.name}
            onClick={() => onTabSelect(tab.name)}
            onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); onTabClose(tab.name); } }}
            title={tab.name}
            className={`group flex items-center gap-1.5 px-2.5 min-w-[80px] max-w-[200px] h-[35px] cursor-pointer text-xs border-r border-[#252526] whitespace-nowrap shrink-0 relative transition-colors ${
              isActive ? "bg-ct-vscode-bg text-white" : "bg-ct-vscode-tabs text-gray-400 hover:text-white"
            }`}
          >
            {/* Active top border */}
            {isActive && (
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-white" />
            )}

            <FileIcon name={tab.name} />

            <span className="truncate flex-1 text-xs">
              {shortName(tab.name)}
            </span>

            {tab.modified ? (
              <div className="w-2 h-2 rounded-full bg-white shrink-0" />
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); onTabClose(tab.name); }}
                title="Close"
                className="bg-transparent border-none text-gray-400 cursor-pointer flex items-center justify-center w-4 h-4 rounded shrink-0 p-0 opacity-0 group-hover:opacity-100 hover:bg-white/20 hover:text-white transition-opacity"
              >
                <X size={12} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
