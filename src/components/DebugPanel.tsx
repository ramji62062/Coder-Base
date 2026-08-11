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
    <div className="flex flex-col h-full select-none text-gray-200 bg-ct-vscode-sidebar font-inter">
      <div className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-300 border-b border-ct-border flex justify-between items-center">
        <span>Run and Debug</span>
        <span className="text-[9px] bg-white/20 text-white rounded px-1.5 py-[1px] font-extrabold">READY</span>
      </div>

      <div className="p-2.5 flex gap-1.5 border-b border-ct-border">
        <button onClick={runDebug} disabled={running} title="Run debugger"
          className="flex-1 h-[30px] rounded bg-white border-none text-black cursor-pointer text-xs font-extrabold flex items-center justify-center gap-1.5 hover:bg-gray-200 transition-colors disabled:opacity-50">
          {running ? <Square size={13} /> : <Play size={13} fill="black" />} {running ? "Running..." : "Run Debug"}
        </button>
      </div>

      <div className="p-3 border-b border-ct-border">
        <div className="text-[11px] font-bold text-gray-400 mb-2 uppercase tracking-wider">Diagnostics</div>
        {diagnostics.length === 0 ? (
          <div className="flex items-center gap-1.5 text-xs text-white"><CheckCircle2 size={13}/> No quick issues found in {activeFile}</div>
        ) : diagnostics.map((issue) => (
          <div key={issue} className="flex items-start gap-1.5 text-xs text-gray-300 mb-1">
            <AlertTriangle size={13} className="shrink-0 mt-0.5 text-white"/> <span>{issue}</span>
          </div>
        ))}
      </div>

      <div className="p-3 border-b border-ct-border">
        <div className="text-[11px] font-bold text-gray-400 mb-2 uppercase tracking-wider">Debug Console</div>
        {exitCode === null ? (
          <div className="text-xs text-gray-500 italic">Run Debug to execute the current file and inspect output.</div>
        ) : (
          <div className={`bg-[#111119] border border-ct-border rounded p-2 font-mono text-xs whitespace-pre-wrap max-h-[140px] overflow-auto ${
            exitCode === 0 ? "text-gray-200" : "text-red-400"
          }`}>
            {stdout || stderr || `Process exited with code ${exitCode}`}
          </div>
        )}
      </div>

      <div className="p-3 flex-1 overflow-auto">
        <div className="flex justify-between items-center mb-1.5">
          <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
            <Bug size={12}/> Breakpoints ({breakpoints.length})
          </div>
          {breakpoints.length > 0 && (
            <button onClick={onClearBreakpoints} className="bg-transparent border-none text-gray-500 cursor-pointer text-[10px] flex items-center gap-1 hover:text-white" title="Clear all">
              <Trash2 size={11}/> Clear
            </button>
          )}
        </div>
        {breakpoints.length === 0 ? (
          <div className="text-xs text-gray-500 italic">Click the editor gutter to set breakpoints.</div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {breakpoints.map((bp, i) => (
              <div key={`${bp.file}-${bp.line}-${i}`} className="flex items-center gap-2 px-1.5 py-0.5 rounded text-xs text-gray-300">
                <span className="w-2 h-2 rounded-full bg-white shrink-0" />
                <span className="flex-1 truncate">{bp.file}:{bp.line}</span>
                <button onClick={() => onRemoveBreakpoint(bp.file, bp.line)} className="bg-transparent border-none text-gray-500 cursor-pointer text-[10px] p-0 hover:text-white">x</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
