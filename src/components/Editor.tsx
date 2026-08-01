"use client";

import { useEffect, useRef, useState } from "react";
import MonacoEditor, { type OnMount } from "@monaco-editor/react";
import { X, Search, Replace, ChevronDown, ChevronUp } from "lucide-react";

type EditorProps = {
  roomId: string;
  language: string;
  code: string;
  onCodeChange: (code: string) => void;
  currentUserId: string;
  wordWrap: boolean;
  onCursorChange: (line: number, col: number) => void;
  onSyncStatusChange: (status: "synced" | "syncing" | "saved") => void;
  codeRef: React.MutableRefObject<string>;
  saveRef: React.MutableRefObject<(() => void) | null>;
  activeFileName: string;
  breakpoints: { file: string; line: number }[];
  onBreakpointToggle: (file: string, line: number) => void;
  remoteCursors?: RemoteCursor[];
};

export type RemoteCursor = {
  userId: string;
  name: string;
  file: string;
  line: number;
  col: number;
  color: string;
};

export default function Editor(props: EditorProps) {
  const [isFindOpen, setIsFindOpen] = useState(false);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");

  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const remoteDecorationsRef = useRef<any>(null);

  // The last value that the LOCAL user typed into Monaco.
  // When props.code changes and equals this ref, it's just React reflecting
  // the user's own keystroke back — we skip the imperative update.
  // When they differ, a remote peer changed the code — we apply it.
  const localValueRef = useRef<string>(props.code);

  // While true, onChange is suppressed (we're programmatically setting the model).
  const suppressOnChangeRef = useRef(false);

  // Used to detect file-tab switches vs. content-only changes.
  const prevFileNameRef = useRef<string>(props.activeFileName);

  // Always keep codeRef current so the terminal can read the latest code.
  useEffect(() => {
    props.codeRef.current = props.code;
  }, [props.code, props.codeRef]);

  // ── Apply code changes from props to the Monaco model ──
  // This effect fires whenever props.code OR props.activeFileName changes.
  // We must handle two distinct cases:
  //   A) File-tab switch  → load the new file's content, reset cursor to (1,1)
  //   B) Remote code update → apply new content while preserving cursor position
  useEffect(() => {
    const isFileSwitch = props.activeFileName !== prevFileNameRef.current;
    prevFileNameRef.current = props.activeFileName;

    const editor = editorRef.current;

    if (isFileSwitch) {
      // Always update localValueRef on a file switch so the code-change
      // guard below doesn't mis-classify the upcoming prop change.
      localValueRef.current = props.code;
      if (!editor) return; // editor not mounted yet; defaultValue handles initial load
      const model = editor.getModel();
      if (!model) return;
      suppressOnChangeRef.current = true;
      model.setValue(props.code);
      suppressOnChangeRef.current = false;
      editor.setPosition({ lineNumber: 1, column: 1 });
      editor.setScrollTop(0);
      return;
    }

    // Not a file switch — check if this is a REMOTE content update.
    // If props.code equals what the local user last typed, skip (our own keystroke
    // being reflected back through React state).
    if (props.code === localValueRef.current) return;

    // ── Remote change ──
    if (!editor) return; // editor not yet mounted; once it mounts defaultValue gives initial content
    const model = editor.getModel();
    if (!model) return;

    const currentEditorValue = model.getValue();
    if (props.code === currentEditorValue) {
      // Model already has this content (race: editor applied it some other way).
      localValueRef.current = props.code;
      return;
    }

    // Save cursor so we can restore it after the replacement.
    const position = editor.getPosition();
    const scrollTop = editor.getScrollTop();

    // Apply the remote code — suppress onChange to prevent echo.
    suppressOnChangeRef.current = true;
    model.setValue(props.code);
    suppressOnChangeRef.current = false;
    localValueRef.current = props.code;

    // Restore cursor, clamped to the new content bounds.
    if (position) {
      const lines = props.code.split("\n");
      const safeLineNumber = Math.min(position.lineNumber, Math.max(1, lines.length));
      const lineLen = (lines[safeLineNumber - 1] ?? "").length;
      const safeColumn = Math.min(position.column, lineLen + 1);
      editor.setPosition({ lineNumber: safeLineNumber, column: safeColumn });
    }
    editor.setScrollTop(scrollTop);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.code, props.activeFileName]);

  // ── Editor mount ──
  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Sync localValueRef with whatever defaultValue rendered.
    const mountedValue = editor.getModel()?.getValue() ?? props.code;
    localValueRef.current = mountedValue;
    props.codeRef.current = mountedValue;

    // If props.code changed between first render and mount, apply it now.
    if (mountedValue !== props.code) {
      suppressOnChangeRef.current = true;
      editor.getModel()?.setValue(props.code);
      suppressOnChangeRef.current = false;
      localValueRef.current = props.code;
      props.codeRef.current = props.code;
    }

    // VS Code Dark+ theme
    monaco.editor.defineTheme("vscode-dark-plus", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#1e1e1e",
        "editor.lineHighlightBackground": "#2a2d2e",
        "editorCursor.foreground": "#aeafad",
        "editorWhitespace.foreground": "#e3e4e229",
        "editor.selectionBackground": "#264f78",
        "editor.inactiveSelectionBackground": "#3a3d41",
      },
    });
    monaco.editor.setTheme("vscode-dark-plus");

    editor.onDidChangeCursorPosition((e) => {
      props.onCursorChange(e.position.lineNumber, e.position.column);
    });

    // Ctrl+H / Ctrl+F → custom find-replace panel
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyH, () => setIsFindOpen(true));
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => setIsFindOpen(true));
  };

  // ── Remote cursors ──
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (!model) return;

    const visible = (props.remoteCursors || []).filter((c) => c.file === props.activeFileName);
    const decorations = visible.map((c) => ({
      range: new monaco.Range(c.line, c.col, c.line, c.col),
      options: {
        className: "remote-cursor-line",
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        after: { content: ` ${c.name}`, inlineClassName: "remote-cursor-label" },
        hoverMessage: { value: `${c.name} is on line ${c.line}` },
      },
    }));

    if (!remoteDecorationsRef.current) {
      remoteDecorationsRef.current = editor.createDecorationsCollection(decorations);
    } else {
      remoteDecorationsRef.current.set(decorations);
    }
  }, [props.remoteCursors, props.activeFileName]);

  // ── Find & Replace helpers ──
  const handleFind = () => {
    if (!editorRef.current || !findText) return;
    const model = editorRef.current.getModel();
    const matches = model.findMatches(findText, true, false, false, null, true);
    if (matches.length > 0) {
      editorRef.current.setSelection(matches[0].range);
      editorRef.current.revealRangeInCenter(matches[0].range);
    }
  };

  const handleReplace = () => {
    if (!editorRef.current || !findText) return;
    editorRef.current.trigger("keyboard", "type", { text: replaceText });
  };

  const ext = (props.activeFileName || "").split(".").pop()?.toLowerCase() || "";
  const codeContent = props.code || "";

  const isImage = ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico"].includes(ext) || codeContent.startsWith("data:image/");
  const isPdf = ext === "pdf" || codeContent.startsWith("data:application/pdf");
  const isDoc = ["doc", "docx"].includes(ext);
  const isAudio = ["mp3", "wav", "ogg", "aac"].includes(ext) || codeContent.startsWith("data:audio/");
  const isVideo = ["mp4", "webm", "mov"].includes(ext) || codeContent.startsWith("data:video/");
  const isMedia = isImage || isPdf || isDoc || isAudio || isVideo;

  const [imageZoom, setImageZoom] = useState(1);

  const handleDownloadFile = () => {
    const a = document.createElement("a");
    a.href = codeContent.startsWith("data:") ? codeContent : `data:application/octet-stream;charset=utf-8,${encodeURIComponent(codeContent)}`;
    a.download = props.activeFileName.split("/").pop() || props.activeFileName;
    a.click();
  };

  return (
    <div style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", position: "relative", background: "#1e1e1e" }}>
      {/* Breadcrumb */}
      <div style={{ height: 22, background: "#1e1e1e", display: "flex", alignItems: "center", padding: "0 16px", fontSize: 11, color: "#858585", gap: 4 }}>
        <span>src</span>
        <ChevronRight size={10} />
        <span style={{ color: "#cccccc" }}>{props.activeFileName}</span>
      </div>

      <div style={{ flex: 1, display: "flex", position: "relative", overflow: "hidden" }}>
        {isImage ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#111", overflow: "hidden" }}>
            <div style={{ height: 36, background: "#1a1a1a", borderBottom: "1px solid #282828", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px" }}>
              <span style={{ fontSize: 12, color: "#34d399", fontWeight: 700 }}>🖼️ Image Preview · {props.activeFileName}</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button onClick={() => setImageZoom(z => Math.max(0.2, z - 0.2))} style={{ padding: "3px 8px", background: "#2a2a2a", border: "1px solid #333", color: "#fff", borderRadius: 4, cursor: "pointer" }}>-</button>
                <span style={{ fontSize: 11, color: "#7C3AED", fontWeight: 700 }}>{Math.round(imageZoom * 100)}%</span>
                <button onClick={() => setImageZoom(z => Math.min(4, z + 0.2))} style={{ padding: "3px 8px", background: "#2a2a2a", border: "1px solid #333", color: "#fff", borderRadius: 4, cursor: "pointer" }}>+</button>
                <button onClick={() => setImageZoom(1)} style={{ padding: "3px 8px", background: "#2a2a2a", border: "1px solid #333", color: "#888", borderRadius: 4, cursor: "pointer", fontSize: 11 }}>Reset</button>
                <button onClick={handleDownloadFile} style={{ padding: "3px 10px", background: "#34d399", border: "none", color: "#111", borderRadius: 4, cursor: "pointer", fontSize: 11, fontWeight: 700 }}>Download</button>
              </div>
            </div>
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "auto", padding: 20, backgroundImage: "radial-gradient(#222 1px, transparent 0)", backgroundSize: "16px 16px" }}>
              <img src={codeContent} alt={props.activeFileName} style={{ transform: `scale(${imageZoom})`, transformOrigin: "center center", transition: "transform 0.15s ease-out", maxWidth: "90%", maxHeight: "90%", borderRadius: 6, boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }} />
            </div>
          </div>
        ) : isPdf ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#151515", overflow: "hidden" }}>
            <div style={{ height: 36, background: "#1a1a1a", borderBottom: "1px solid #282828", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px" }}>
              <span style={{ fontSize: 12, color: "#f87171", fontWeight: 700 }}>📕 PDF Document Viewer · {props.activeFileName}</span>
              <button onClick={handleDownloadFile} style={{ padding: "3px 10px", background: "#f87171", border: "none", color: "#fff", borderRadius: 4, cursor: "pointer", fontSize: 11, fontWeight: 700 }}>Download PDF</button>
            </div>
            <div style={{ flex: 1, position: "relative" }}>
              <object data={codeContent} type="application/pdf" style={{ width: "100%", height: "100%", border: "none" }}>
                <iframe src={codeContent} style={{ width: "100%", height: "100%", border: "none" }} title="PDF Preview">
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "#aaa", gap: 12 }}>
                    <p>PDF Preview available for download.</p>
                    <button onClick={handleDownloadFile} style={{ padding: "8px 16px", background: "#f87171", color: "#fff", border: "none", borderRadius: 6, fontWeight: 700, cursor: "pointer" }}>Download PDF Document</button>
                  </div>
                </iframe>
              </object>
            </div>
          </div>
        ) : isDoc ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#121216", padding: 30 }}>
            <div style={{ background: "#1a1a24", border: "1px solid #2a2a3c", borderRadius: 12, padding: 32, maxWidth: 440, width: "100%", textAlign: "center", boxShadow: "0 12px 40px rgba(0,0,0,0.4)" }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(96,165,250,0.15)", border: "1px solid rgba(96,165,250,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 16px" }}>
                📄
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 8, wordBreak: "break-all" }}>{props.activeFileName.split("/").pop()}</h3>
              <p style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>Word Document (.doc/.docx)</p>
              <button onClick={handleDownloadFile} style={{ width: "100%", padding: "10px 16px", background: "#60a5fa", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "background 0.2s" }}>
                Download & Open Document
              </button>
            </div>
          </div>
        ) : isAudio || isVideo ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#0a0a0f", overflow: "hidden" }}>
            <div style={{ height: 36, background: "#14141c", borderBottom: "1px solid #222", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px" }}>
              <span style={{ fontSize: 12, color: isVideo ? "#fae845" : "#c084fc", fontWeight: 700 }}>{isVideo ? "🎬 Video Player" : "🎵 Audio Player"} · {props.activeFileName}</span>
              <button onClick={handleDownloadFile} style={{ padding: "3px 10px", background: isVideo ? "#eab308" : "#a855f7", border: "none", color: "#fff", borderRadius: 4, cursor: "pointer", fontSize: 11, fontWeight: 700 }}>Download Media</button>
            </div>
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
              {isVideo ? (
                <video src={codeContent} controls autoPlay style={{ maxWidth: "90%", maxHeight: "90%", borderRadius: 8, boxShadow: "0 10px 35px rgba(0,0,0,0.6)" }} />
              ) : (
                <div style={{ background: "#161622", border: "1px solid #2a2a3a", borderRadius: 16, padding: 32, display: "flex", flexDirection: "column", alignItems: "center", gap: 16, minWidth: 320 }}>
                  <div style={{ width: 60, height: 60, borderRadius: "50%", background: "#a855f720", border: "1px solid #a855f740", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>🎵</div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{props.activeFileName.split("/").pop()}</span>
                  <audio src={codeContent} controls autoPlay style={{ width: "100%" }} />
                </div>
              )}
            </div>
          </div>
        ) : (
          <MonacoEditor
            height="100%"
            language={props.language}
            defaultValue={props.code}
            theme="vs-dark"
            onChange={(val) => {
              // Suppressed while we apply a remote/file-switch update programmatically.
              if (suppressOnChangeRef.current) return;
              const next = val ?? "";
              // Record this as the last LOCAL value.
              localValueRef.current = next;
              props.codeRef.current = next;
              props.onCodeChange(next);
            }}
            onMount={handleEditorMount}
            options={{
              minimap: { enabled: true, scale: 0.7, side: "right", renderCharacters: false },
              fontSize: 14,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              lineNumbers: "on",
              roundedSelection: false,
              scrollBeyondLastLine: false,
              readOnly: false,
              cursorBlinking: "blink",
              cursorSmoothCaretAnimation: "on",
              renderLineHighlight: "all",
              wordWrap: props.wordWrap ? "on" : "off",
              automaticLayout: true,
              padding: { top: 10, bottom: 10 },
              scrollbar: {
                vertical: "visible",
                horizontal: "visible",
                useShadows: false,
                verticalScrollbarSize: 10,
                horizontalScrollbarSize: 10,
              },
            }}
          />
        )}

        {/* Find & Replace overlay */}
        {isFindOpen && !isMedia && (
          <div
            className="fade-in"
            style={{
              position: "absolute", top: 10, right: 30, background: "#252526",
              border: "1px solid #454545", padding: 8, zIndex: 100, borderRadius: 2,
              display: "flex", flexDirection: "column", gap: 6, width: 260,
              boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ flex: 1, display: "flex", alignItems: "center", background: "#3c3c3c", padding: "2px 4px" }}>
                <Search size={14} color="#858585" />
                <input
                  autoFocus value={findText}
                  onChange={(e) => setFindText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleFind()}
                  placeholder="Find"
                  style={{ flex: 1, background: "transparent", border: "none", color: "#fff", fontSize: 12, outline: "none", marginLeft: 4 }}
                />
              </div>
              <X size={14} color="#858585" style={{ cursor: "pointer" }} onClick={() => setIsFindOpen(false)} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ flex: 1, display: "flex", alignItems: "center", background: "#3c3c3c", padding: "2px 4px" }}>
                <Replace size={14} color="#858585" />
                <input
                  value={replaceText}
                  onChange={(e) => setReplaceText(e.target.value)}
                  placeholder="Replace"
                  style={{ flex: 1, background: "transparent", border: "none", color: "#fff", fontSize: 12, outline: "none", marginLeft: 4 }}
                />
              </div>
              <button onClick={handleReplace} style={{ background: "#444", border: "none", color: "#fff", fontSize: 10, padding: "2px 6px", cursor: "pointer" }}>
                Replace
              </button>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .minimap-overlay { position: absolute; top: 0; right: 0; width: 60px; height: 100%; background: rgba(255,255,255,0.02); pointer-events: none; }
      `}</style>
      <style jsx global>{`
        .remote-cursor-line { border-left: 2px solid #22d3ee; }
        .remote-cursor-label {
          background: #0e7490; border-radius: 3px; color: #fff;
          font-size: 11px; font-weight: 700; margin-left: 6px;
          padding: 1px 5px; pointer-events: none;
        }
      `}</style>
    </div>
  );
}

function ChevronRight({ size, color = "currentColor" }: { size: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
