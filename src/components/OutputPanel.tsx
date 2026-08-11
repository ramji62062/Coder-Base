"use client";

export type OutputLine = { text: string; type: "log" | "error" };

type OutputPanelProps = {
  lines: OutputLine[];
  onClear: () => void;
  onClose: () => void;
};

export default function OutputPanel({ lines, onClear, onClose }: OutputPanelProps) {
  return (
    <div className="bg-[#1e1e1e] border-t border-[#3c3c3c] flex flex-col h-full min-h-0 text-gray-200">
      {/* Tab bar */}
      <div className="flex items-center justify-between bg-ct-vscode-sidebar border-b border-[#3c3c3c] px-2 h-[35px] min-h-[35px] text-xs">
        <div className="flex gap-4">
          <span className="text-white border-b border-white pb-1 cursor-default font-semibold">
            Output
          </span>
          <span className="text-gray-500 pb-1 cursor-default">Problems</span>
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={onClear}
            title="Clear Output"
            className="bg-transparent border-none text-gray-400 cursor-pointer text-xs px-1 hover:text-white"
          >
            ⌧
          </button>
          <button
            onClick={onClose}
            title="Close Panel"
            className="bg-transparent border-none text-gray-400 cursor-pointer text-base px-1 leading-none hover:text-white"
          >
            ×
          </button>
        </div>
      </div>

      {/* Output content */}
      <div className="flex-1 overflow-auto p-[8px_12px] font-mono text-[13px] leading-relaxed">
        {lines.length === 0 ? (
          <span className="text-gray-500">No output yet. Click ▶ Run to execute your code.</span>
        ) : (
          lines.map((line, i) => (
            <div key={i} className={`whitespace-pre-wrap ${line.type === "error" ? "text-red-400" : "text-gray-300"}`}>
              {line.text}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
