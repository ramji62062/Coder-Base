"use client";

export type OutputLine = { text: string; type: "log" | "error" };

type OutputPanelProps = {
  lines: OutputLine[];
  onClear: () => void;
  onClose: () => void;
};

export default function OutputPanel({ lines, onClear, onClose }: OutputPanelProps) {
  return (
    <div
      style={{
        background: "#1e1e1e",
        borderTop: "1px solid var(--vscode-border)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "var(--vscode-sidebar)",
          borderBottom: "1px solid var(--vscode-border)",
          padding: "0 8px",
          height: 35,
          minHeight: 35,
          fontSize: 12,
        }}
      >
        <div style={{ display: "flex", gap: 16 }}>
          <span style={{ color: "#fff", borderBottom: "1px solid #fff", paddingBottom: 4, cursor: "default" }}>
            Output
          </span>
          <span style={{ color: "#858585", paddingBottom: 4, cursor: "default" }}>Problems</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={onClear}
            title="Clear Output"
            style={{
              background: "none",
              border: "none",
              color: "#858585",
              cursor: "pointer",
              fontSize: 13,
              padding: "2px 4px",
            }}
          >
            ⌧
          </button>
          <button
            onClick={onClose}
            title="Close Panel"
            style={{
              background: "none",
              border: "none",
              color: "#858585",
              cursor: "pointer",
              fontSize: 16,
              padding: "2px 4px",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      </div>

      {/* Output content */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "8px 12px",
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        {lines.length === 0 ? (
          <span style={{ color: "#858585" }}>No output yet. Click ▶ Run to execute your code.</span>
        ) : (
          lines.map((line, i) => (
            <div key={i} style={{ color: line.type === "error" ? "#f44747" : "#d4d4d4", whiteSpace: "pre-wrap" }}>
              {line.text}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
