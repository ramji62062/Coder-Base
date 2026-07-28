"use client";

import { ChevronRight } from "lucide-react";

type BreadcrumbBarProps = {
  activeFile: string;
};

function FileIcon({ ext }: { ext: string }) {
  const colors: Record<string, string> = {
    js: "#e8d44d", jsx: "#61dafb", ts: "#3178c6", tsx: "#61dafb",
    py: "#3572a5", java: "#b07219", cpp: "#f34b7d", go: "#00add8",
    rs: "#dea584", html: "#e44b23", css: "#563d7c", json: "#cbcb41",
    md: "#083fa1",
  };
  const color = colors[ext] || "#ccc";
  return <div style={{ width: 10, height: 10, borderRadius: 1, background: color, flexShrink: 0 }} />;
}

export default function BreadcrumbBar({ activeFile }: BreadcrumbBarProps) {
  if (!activeFile) return (
    <div className="breadcrumb-bar" />
  );

  const parts = activeFile.split("/");
  const ext = activeFile.split(".").pop()?.toLowerCase() || "";

  return (
    <div className="breadcrumb-bar">
      <span style={{ color: "#858585" }}>src</span>
      {parts.map((part, i) => {
        const isLast = i === parts.length - 1;
        return (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <ChevronRight size={12} color="#555" style={{ flexShrink: 0 }} />
            {isLast && <FileIcon ext={ext} />}
            <span style={{ color: isLast ? "#ccc" : "#858585" }}>{part}</span>
          </span>
        );
      })}
    </div>
  );
}
