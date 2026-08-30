"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import MonacoEditor, { type OnMount } from "@monaco-editor/react";
import { X, Search, Replace, ChevronDown, ChevronUp } from "lucide-react";
import { LspClient } from "@/lib/lsp-client";
import { supabase } from "@/lib/supabase";

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
  const lspRef = useRef<LspClient | null>(null);

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

  // ── Real LSP client (dedicated /ws/lsp channel) ──
  const connectLsp = useCallback(async () => {
    if (!props.roomId || !lspRef.current) return;
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;
    lspRef.current.connect(props.roomId, token, props.currentUserId, props.language);
  }, [props.roomId, props.currentUserId, props.language]);

  // ── Editor mount ──
  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Sync localValueRef with whatever defaultValue rendered.
    const mountedValue = editor.getModel()?.getValue() ?? props.code;
    localValueRef.current = mountedValue;
    props.codeRef.current = mountedValue;

    // Wire the real language server for this (room, file, language).
    if (!lspRef.current) {
      lspRef.current = new LspClient({
        monaco,
        getEditor: () => editorRef.current,
        getActiveFile: () => props.activeFileName,
        getLanguage: () => props.language,
      });
    }
    void connectLsp();

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

    // Ctrl+S / Cmd+S → Save project / file
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      props.saveRef.current?.();
    });

    // Ctrl+H / Ctrl+F → custom find-replace panel
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyH, () => setIsFindOpen(true));
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => setIsFindOpen(true));
  };

  // ── LSP: keep the open document in sync with the active file ──
  useEffect(() => {
    lspRef.current?.setActiveFile(props.activeFileName);
  }, [props.activeFileName]);

  // ── LSP: re-bind to the correct language server when language changes ──
  useEffect(() => {
    lspRef.current?.setLanguage(props.language);
    if (lspRef.current) {
      lspRef.current.disconnect();
      void connectLsp();
    }
  }, [props.language, connectLsp]);

  // ── LSP: cleanup on unmount ──
  useEffect(() => {
    return () => { lspRef.current?.dispose(); lspRef.current = null; };
  }, []);

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
    <div className="relative flex h-full flex-1 flex-col bg-[#1e1e1e]">
      {/* Breadcrumb */}
      <div className="flex h-[22px] items-center gap-1 bg-[#1e1e1e] px-4 text-[11px] text-[#858585]">
        <span>src</span>
        <ChevronRight size={10} />
        <span className="text-[#cccccc]">{props.activeFileName}</span>
      </div>

      <div className="relative flex flex-1 overflow-hidden">
        {isImage ? (
          <div className="flex flex-1 flex-col overflow-hidden bg-[#111]">
            <div className="flex h-9 items-center justify-between border-b border-[#282828] bg-[#1a1a1a] px-4">
              <span className="text-xs font-bold text-white">🖼️ Image Preview · {props.activeFileName}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setImageZoom(z => Math.max(0.2, z - 0.2))} className="cursor-pointer rounded border border-[#333] bg-[#2a2a2a] px-2 py-[3px] text-white">-</button>
                <span className="text-[11px] font-bold text-white">{Math.round(imageZoom * 100)}%</span>
                <button onClick={() => setImageZoom(z => Math.min(4, z + 0.2))} className="cursor-pointer rounded border border-[#333] bg-[#2a2a2a] px-2 py-[3px] text-white">+</button>
                <button onClick={() => setImageZoom(1)} className="cursor-pointer rounded border border-[#333] bg-[#2a2a2a] px-2 py-[3px] text-[11px] text-[#888]">Reset</button>
                <button onClick={handleDownloadFile} className="cursor-pointer rounded border-none bg-white px-2.5 py-[3px] text-[11px] font-bold text-black">Download</button>
              </div>
            </div>
            <div className="flex flex-1 items-center justify-center overflow-auto bg-[radial-gradient(#222_1px,transparent_0)] bg-[length:16px_16px] p-5">
              {(() => {
                const imageSrc = codeContent.startsWith("data:")
                  ? codeContent
                  : codeContent.trim().startsWith("<svg")
                  ? `data:image/svg+xml;utf8,${encodeURIComponent(codeContent)}`
                  : `/api/workspace/${props.roomId}/${props.activeFileName}`;
                return (
                  <img
                    src={imageSrc}
                    alt={props.activeFileName}
                    className="max-h-[90%] max-w-[90%] rounded-md shadow-[0_10px_30px_rgba(0,0,0,0.5)] transition-transform duration-150 ease-out"
                    style={{ transform: `scale(${imageZoom})`, transformOrigin: "center center" }}
                  />
                );
              })()}
            </div>
          </div>
        ) : isPdf ? (
          <div className="flex flex-1 flex-col overflow-hidden bg-[#151515]">
            <div className="flex h-9 items-center justify-between border-b border-[#282828] bg-[#1a1a1a] px-4">
              <span className="text-xs font-bold text-white">📕 PDF Document Viewer · {props.activeFileName}</span>
              <button onClick={handleDownloadFile} className="cursor-pointer rounded border-none bg-white px-2.5 py-[3px] text-[11px] font-bold text-black">Download PDF</button>
            </div>
            <div className="relative flex-1">
              <object data={codeContent} type="application/pdf" className="h-full w-full border-none">
                <iframe src={codeContent} className="h-full w-full border-none" title="PDF Preview">
                  <div className="flex h-full flex-col items-center justify-center gap-3 text-[#aaa]">
                    <p>PDF Preview available for download.</p>
                    <button onClick={handleDownloadFile} className="cursor-pointer rounded-md border-none bg-white px-4 py-2 font-bold text-black">Download PDF Document</button>
                  </div>
                </iframe>
              </object>
            </div>
          </div>
        ) : isDoc ? (
          <div className="flex flex-1 flex-col items-center justify-center bg-[#121216] p-[30px]">
            <div className="w-full max-w-[440px] rounded-xl border border-[#2a2a3c] bg-[#1a1a24] p-8 text-center shadow-[0_12px_40px_rgba(0,0,0,0.4)]">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[28px]">
                📄
              </div>
              <h3 className="mb-2 break-all text-lg font-extrabold text-white">{props.activeFileName.split("/").pop()}</h3>
              <p className="mb-5 text-[13px] text-[#888]">Word Document (.doc/.docx)</p>
              <button onClick={handleDownloadFile} className="w-full cursor-pointer rounded-lg border-none bg-white px-4 py-2.5 text-[13px] font-bold text-black transition-colors hover:bg-gray-200">
                Download & Open Document
              </button>
            </div>
          </div>
        ) : isAudio || isVideo ? (
          <div className="flex flex-1 flex-col overflow-hidden bg-[#0a0a0f]">
            <div className="flex h-9 items-center justify-between border-b border-[#222] bg-[#14141c] px-4">
              <span className="text-xs font-bold text-white">{isVideo ? "🎬 Video Player" : "🎵 Audio Player"} · {props.activeFileName}</span>
              <button onClick={handleDownloadFile} className="cursor-pointer rounded border-none bg-white px-2.5 py-[3px] text-[11px] font-bold text-black">Download Media</button>
            </div>
            <div className="flex flex-1 items-center justify-center p-5">
              {isVideo ? (
                <video src={codeContent} controls autoPlay className="max-h-[90%] max-w-[90%] rounded-lg shadow-[0_10px_35px_rgba(0,0,0,0.6)]" />
              ) : (
                <div className="flex min-w-80 flex-col items-center gap-4 rounded-2xl border border-white/25 bg-[#161622] p-8">
                  <div className="flex h-[60px] w-[60px] items-center justify-center rounded-full border border-white/25 bg-white/10 text-2xl">🎵</div>
                  <span className="text-sm font-bold text-white">{props.activeFileName.split("/").pop()}</span>
                  <audio src={codeContent} controls autoPlay className="w-full" />
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
            className="fade-in absolute right-[30px] top-2.5 z-[100] flex w-[260px] flex-col gap-1.5 rounded-[2px] border border-[#454545] bg-[#252526] p-2 shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
          >
            <div className="flex items-center gap-1">
              <div className="flex flex-1 items-center bg-[#3c3c3c] px-1 py-0.5">
                <Search size={14} color="#858585" />
                <input
                  autoFocus value={findText}
                  onChange={(e) => setFindText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleFind()}
                  placeholder="Find"
                  className="ml-1 flex-1 border-none bg-transparent text-xs text-white outline-none"
                />
              </div>
              <X size={14} color="#858585" className="cursor-pointer" onClick={() => setIsFindOpen(false)} />
            </div>
            <div className="flex items-center gap-1">
              <div className="flex flex-1 items-center bg-[#3c3c3c] px-1 py-0.5">
                <Replace size={14} color="#858585" />
                <input
                  value={replaceText}
                  onChange={(e) => setReplaceText(e.target.value)}
                  placeholder="Replace"
                  className="ml-1 flex-1 border-none bg-transparent text-xs text-white outline-none"
                />
              </div>
              <button onClick={handleReplace} className="cursor-pointer border-none bg-[#444] px-1.5 py-0.5 text-[10px] text-white">
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
        .remote-cursor-line { border-left: 2px solid #ffffff; }
        .remote-cursor-label {
          background: #ffffff; border-radius: 3px; color: #000;
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
