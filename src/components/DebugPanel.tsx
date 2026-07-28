"use client";

import { useMemo, useState } from "react";
import { Play, Square, Bug, AlertTriangle, CheckCircle2, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Breakpoint = { file: string; line: number };

type DebugPanelProps = {
  breakpoints: Breakpoint[];
  onClearBreakpoints: () => void;
  onRemoveBreakpoint: (file: string, line: number) => void;
  currentCode?: string;
  language?: string;
  activeFile?: string;
};

function localDiagnostics(code: string, language: string) {
  const issues: string[] = [];
  if (!code.trim()) issues.push("Current file is empty.");
  if (language === "javascript" || language === "typescript") {
    const openBraces = (code.match(/\{/g) || []).length;
    const closeBraces = (code.match(/\}/g) || []).length;
    const openParens = (code.match(/\(/g) || []).length;
    const closeParens = (code.match(/\)/g) || []).length;
    if (openBraces !== closeBraces) issues.push(`Brace mismatch: ${openBraces} opening, ${closeBraces} closing.`);
    if (openParens !== closeParens) issues.push(`Parenthesis mismatch: ${openParens} opening, ${closeParens} closing.`);
    if (/\bconsole\.log\([^)]*$/.test(code)) issues.push("Possible unfinished console.log call.");
  }
  if (language === "python") {
    const mixedIndent = code.split("\n").some(line => /^ +\t|\t+ /.test(line));
    if (mixedIndent) issues.push("Mixed tabs and spaces detected.");
  }
  return issues;
}

export default function DebugPanel({
  breakpoints,
  onClearBreakpoints,
  onRemoveBreakpoint,
  currentCode = "",
  language = "javascript",
  activeFile = "current file",
}: DebugPanelProps) {
  const [running, setRunning] = useState(false);
  const [stdout, setStdout] = useState("");
  const [stderr, setStderr] = useState("");
  const [exitCode, setExitCode] = useState<number | null>(null);
  const diagnostics = useMemo(() => localDiagnostics(currentCode, language), [currentCode, language]);

  async function runDebug() {
    setRunning(true);
    setStdout("");
    setStderr("");
    setExitCode(null);
    try {
      const res = await fetch("/api/run-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ""}`,
        },
        body: JSON.stringify({ code: currentCode, language }),
      });
      const data = await res.json();
      setStdout(data.stdout || "");
      setStderr(data.stderr || data.error || "");
      setExitCode(typeof data.exitCode === "number" ? data.exitCode : res.ok ? 0 : 1);
    } catch (err) {
      setStderr(err instanceof Error ? err.message : String(err));
      setExitCode(1);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", userSelect: "none" }}>
      <div style={{ padding: "10px 12px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#bbb", borderBottom: "1px solid var(--vscode-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>Run and Debug</span>
        <span style={{ fontSize: 9, background: "#4ec9b0", color: "#062b24", borderRadius: 3, padding: "1px 5px", fontWeight: 800 }}>READY</span>
      </div>

      <div style={{ padding: "10px 12px", display: "flex", gap: 6, borderBottom: "1px solid var(--vscode-border)" }}>
        <button onClick={runDebug} disabled={running} title="Run debugger"
          style={{ flex: 1, height: 30, borderRadius: 4, background: running ? "#333" : "#0e639c", border: "none", color: "#fff", cursor: running ? "default" : "pointer", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          {running ? <Square size={13} /> : <Play size={13} />} {running ? "Running..." : "Run Debug"}
        </button>
      </div>

      <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--vscode-border)" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#bbb", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>Diagnostics</div>
        {diagnostics.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#4ec9b0" }}><CheckCircle2 size={13}/> No quick issues found in {activeFile}</div>
        ) : diagnostics.map((issue) => (
          <div key={issue} style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12, color: "#e8ab53", marginBottom: 5 }}>
            <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }}/> <span>{issue}</span>
          </div>
        ))}
      </div>

      <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--vscode-border)" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#bbb", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>Debug Console</div>
        {exitCode === null ? (
          <div style={{ fontSize: 12, color: "#858585", fontStyle: "italic" }}>Run Debug to execute the current file and inspect output.</div>
        ) : (
          <div style={{ background: "#111", border: "1px solid #333", borderRadius: 4, padding: 8, fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap", maxHeight: 140, overflow: "auto", color: exitCode === 0 ? "#d4d4d4" : "#f44747" }}>
            {stdout || stderr || `Process exited with code ${exitCode}`}
          </div>
        )}
      </div>

      <div style={{ padding: "8px 12px", flex: 1, overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#bbb", textTransform: "uppercase", letterSpacing: 0.5, display: "flex", alignItems: "center", gap: 5 }}>
            <Bug size={12}/> Breakpoints ({breakpoints.length})
          </div>
          {breakpoints.length > 0 && (
            <button onClick={onClearBreakpoints} style={{ background: "none", border: "none", color: "#858585", cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", gap: 4 }} title="Clear all">
              <Trash2 size={11}/> Clear
            </button>
          )}
        </div>
        {breakpoints.length === 0 ? (
          <div style={{ fontSize: 12, color: "#858585", fontStyle: "italic" }}>Click the editor gutter to set breakpoints.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {breakpoints.map((bp, i) => (
              <div key={`${bp.file}-${bp.line}-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 6px", borderRadius: 3, fontSize: 12, color: "#d4d4d4" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#e51400", flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bp.file}:{bp.line}</span>
                <button onClick={() => onRemoveBreakpoint(bp.file, bp.line)} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 10, padding: 0 }}>x</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
