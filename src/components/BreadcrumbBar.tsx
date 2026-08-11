"use client";

import { ChevronRight } from "lucide-react";

type BreadcrumbBarProps = {
  activeFile: string;
};

export default function BreadcrumbBar({ activeFile }: BreadcrumbBarProps) {
  if (!activeFile) return (
    <div className="breadcrumb-bar" />
  );

  const parts = activeFile.split("/");

  return (
    <div className="breadcrumb-bar flex items-center gap-1 text-xs text-gray-500 bg-[#1e1e1e] px-3 py-1 border-b border-[#2d2d30] select-none">
      <span className="text-gray-400">src</span>
      {parts.map((part, i) => {
        const isLast = i === parts.length - 1;
        return (
          <span key={i} className="flex items-center gap-1">
            <ChevronRight size={12} className="text-gray-600 shrink-0" />
            {isLast && <div className="w-2 h-2 rounded-xs bg-white shrink-0" />}
            <span className={isLast ? "text-gray-200 font-medium" : "text-gray-400"}>{part}</span>
          </span>
        );
      })}
    </div>
  );
}
