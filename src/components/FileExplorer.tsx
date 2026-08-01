"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { ChevronDown, ChevronRight, FilePlus, FolderPlus, File, Folder, FolderOpen, Edit, Trash2, Copy, Clipboard, Scissors, Save, Upload } from "lucide-react";

export type FileItem = {
  name: string;
  content: string;
  language: string;
  path?: string;
  isFolder?: boolean;
};

type FileExplorerProps = {
  files: FileItem[];
  activeFile: string;
  openFileNames?: string[];
  expandedFolders?: string[];
  onFileSelect: (name: string) => void;
  onFolderToggle?: (path: string, expanded: boolean) => void;
  onFileCreate: (file: FileItem) => void;
  onFileDelete: (name: string) => void;
  onFileRename: (oldName: string, newName: string) => void;
  onOpenProject?: () => void;
  onSaveProject?: () => void;
  projectName?: string;
};

type TreeNode = {
  name: string;
  fullPath: string;
  isFolder: boolean;
  file?: FileItem;
  children: Map<string, TreeNode>;
};

const FILE_ICONS: Record<string, string> = {
  js: "JS", jsx: "JSX", ts: "TS", tsx: "TSX",
  py: "PY", java: "JAVA", cpp: "C++", c: "C",
  go: "GO", rs: "RS", html: "HTML", css: "CSS", json: "{}",
  md: "MD", txt: "TXT", png: "IMG", jpg: "IMG", jpeg: "IMG",
  gif: "IMG", webp: "IMG", svg: "IMG", ico: "IMG", pdf: "PDF",
  doc: "DOC", docx: "DOC", mp3: "AUD", wav: "AUD", mp4: "VID", webm: "VID",
  default: "",
};

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
}

function baseName(path: string) {
  return normalizePath(path).split("/").pop() || path;
}

function dirName(path: string) {
  const clean = normalizePath(path);
  const parts = clean.split("/");
  parts.pop();
  return parts.join("/");
}

function getIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return FILE_ICONS[ext] || FILE_ICONS.default;
}

function getIconColor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const colors: Record<string, string> = {
    js: "#f1e05a", jsx: "#61dafb", ts: "#3178c6", tsx: "#61dafb",
    py: "#3572A5", html: "#e34c26", css: "#563d7c", md: "#3b82f6",
    json: "#f59e0b", java: "#f97316", cpp: "#60a5fa",
    png: "#34d399", jpg: "#34d399", jpeg: "#34d399", gif: "#34d399", webp: "#34d399", svg: "#34d399",
    pdf: "#f87171", doc: "#60a5fa", docx: "#60a5fa", mp3: "#c084fc", wav: "#c084fc", mp4: "#fbbf24", webm: "#fbbf24",
  };
  return colors[ext] || "#858585";
}

function getLangFromExt(name: string): string {
  const map: Record<string, string> = {
    js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
    py: "python", java: "java", cpp: "cpp", c: "c", go: "go", rs: "rust",
    html: "html", css: "css", json: "json", md: "markdown", txt: "plaintext",
    png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", svg: "image",
    pdf: "pdf", doc: "document", docx: "document", mp3: "audio", wav: "audio", mp4: "video", webm: "video",
  };
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return map[ext] || "plaintext";
}

function buildTree(files: FileItem[]): TreeNode {
  const root: TreeNode = { name: "", fullPath: "", isFolder: true, children: new Map() };

  for (const item of files) {
    const fullPath = normalizePath(item.path || item.name);
    if (!fullPath) continue;
    const parts = fullPath.split("/");
    let cursor = root;

    parts.forEach((part, index) => {
      const nodePath = parts.slice(0, index + 1).join("/");
      const isLeaf = index === parts.length - 1;
      let node = cursor.children.get(part);
      if (!node) {
        node = { name: part, fullPath: nodePath, isFolder: !isLeaf || !!item.isFolder, children: new Map() };
        cursor.children.set(part, node);
      }
      if (isLeaf) {
        node.isFolder = !!item.isFolder;
        node.file = item;
      }
      cursor = node;
    });
  }

  return root;
}

export { getLangFromExt };

export default function FileExplorer({
  files,
  activeFile,
  openFileNames,
  expandedFolders,
  onFolderToggle,
  onFileSelect,
  onFileCreate,
  onFileDelete,
  onFileRename,
  onOpenProject,
  onSaveProject,
  projectName,
}: FileExplorerProps) {
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [openEditorsOpen, setOpenEditorsOpen] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["src"]));
  const [creating, setCreating] = useState<{ type: "file" | "folder"; parent: string } | null>(null);
  const [newName, setNewName] = useState("");
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, path: string, isFolder: boolean } | null>(null);
  const [selectedFolder, setSelectedFolder] = useState("");
  const [clipboardPath, setClipboardPath] = useState<{ path: string; cut: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const tree = useMemo(() => buildTree(files), [files]);

  const existingPaths = useMemo(() => new Set(files.map(f => normalizePath(f.path || f.name))), [files]);
  const activePath = normalizePath(activeFile);
  const visibleFiles = useMemo(() => files.filter(f => !f.isFolder), [files]);

  const openFileList = useMemo(() => {
    if (openFileNames && openFileNames.length > 0) {
      const set = new Set(openFileNames.map(normalizePath));
      return visibleFiles.filter(f => set.has(normalizePath(f.path || f.name)));
    }
    return visibleFiles.filter(f => normalizePath(f.path || f.name) === activePath);
  }, [openFileNames, visibleFiles, activePath]);

  useEffect(() => {
    if (!expandedFolders) return;
    setExpanded(new Set(expandedFolders.map(normalizePath)));
  }, [expandedFolders]);

  const startCreate = useCallback((type: "file" | "folder", parent = selectedFolder) => {
    setCreating({ type, parent });
    setNewName("");
    if (parent) setExpanded(prev => new Set(prev).add(parent));
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [selectedFolder]);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };

  const processUploadedFiles = useCallback((filesToProcess: File[], targetFolder = selectedFolder) => {
    filesToProcess.forEach((file) => {
      const isBinaryOrMedia = /\.(png|jpe?g|gif|webp|svg|ico|pdf|mp3|wav|ogg|mp4|webm|doc|docx)$/i.test(file.name) ||
        file.type.startsWith("image/") || file.type.startsWith("video/") ||
        file.type.startsWith("audio/") || file.type === "application/pdf";

      const reader = new FileReader();
      reader.onload = (event) => {
        const relPath = normalizePath((file as any).webkitRelativePath || file.name);
        const path = normalizePath([targetFolder, relPath].filter(Boolean).join("/"));
        onFileCreate({
          name: path,
          path,
          content: (event.target?.result as string) || "",
          language: getLangFromExt(path),
        });
      };

      if (isBinaryOrMedia) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    });
  }, [onFileCreate, selectedFolder]);

  const handleDrop = (e: React.DragEvent, targetFolder = "") => {
    e.preventDefault();
    e.stopPropagation();
    const movePath = e.dataTransfer.getData("application/x-codetogether-path");
    if (movePath) {
      const from = normalizePath(movePath);
      const to = normalizePath([targetFolder, baseName(from)].filter(Boolean).join("/"));
      if (from !== to && !to.startsWith(`${from}/`) && !existingPaths.has(to)) onFileRename(from, to);
      return;
    }
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      processUploadedFiles(droppedFiles, targetFolder);
    }
  };

  const handleCreateSubmit = useCallback(() => {
    if (!creating) return;
    const rawName = newName.trim();
    if (!rawName) { setCreating(null); return; }

    const childName = normalizePath(rawName);
    const fullPath = normalizePath([creating.parent, childName].filter(Boolean).join("/"));
    if (!fullPath || existingPaths.has(fullPath)) { setCreating(null); setNewName(""); return; }

    if (creating.type === "folder") {
      onFileCreate({ name: fullPath, path: fullPath, content: "", language: "folder", isFolder: true });
      setExpanded(prev => new Set(prev).add(fullPath));
    } else {
      onFileCreate({ name: fullPath, path: fullPath, content: "", language: getLangFromExt(fullPath) });
    }
    setCreating(null);
    setNewName("");
  }, [creating, newName, existingPaths, onFileCreate]);

  const handleRenameSubmit = useCallback(() => {
    const oldPath = renamingPath;
    const rawName = renameInput.trim();
    if (!oldPath || !rawName) { setRenamingPath(null); setRenameInput(""); return; }

    const nextPath = normalizePath([dirName(oldPath), normalizePath(rawName)].filter(Boolean).join("/"));
    if (!nextPath || (nextPath !== oldPath && existingPaths.has(nextPath))) {
      setRenamingPath(null);
      setRenameInput("");
      return;
    }
    if (nextPath !== oldPath) onFileRename(oldPath, nextPath);
    setRenamingPath(null);
    setRenameInput("");
  }, [renameInput, renamingPath, existingPaths, onFileRename]);

  const handleContextMenu = (e: React.MouseEvent, path: string, isFolder: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, path, isFolder });
  };

  const copyInto = useCallback((sourcePath: string, targetFolder: string, cut = false) => {
    const source = normalizePath(sourcePath);
    const targetBase = normalizePath([targetFolder, baseName(source)].filter(Boolean).join("/"));
    if (!source || targetBase.startsWith(`${source}/`)) return;

    const sourceItems = files.filter(file => {
      const path = normalizePath(file.path || file.name);
      return path === source || path.startsWith(`${source}/`);
    });
    if (sourceItems.length === 0 || existingPaths.has(targetBase)) return;

    if (cut) {
      onFileRename(source, targetBase);
      return;
    }

    sourceItems.forEach((item) => {
      const oldPath = normalizePath(item.path || item.name);
      const suffix = oldPath === source ? "" : oldPath.slice(source.length + 1);
      const nextPath = normalizePath([targetBase, suffix].filter(Boolean).join("/"));
      onFileCreate({ ...item, name: nextPath, path: nextPath });
    });
  }, [files, existingPaths, onFileCreate, onFileRename]);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const renderCreateInput = (parent: string, depth: number) => {
    if (!creating || creating.parent !== parent) return null;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: `3px 8px 3px ${16 + depth * 12}px` }}>
        {creating.type === "folder" ? <Folder size={14} color="#dcb67a" /> : <File size={14} color="#858585" />}
        <input ref={inputRef} value={newName} onChange={e => setNewName(e.target.value)} onBlur={handleCreateSubmit}
          onKeyDown={e => { if (e.key === "Enter") handleCreateSubmit(); if (e.key === "Escape") setCreating(null); }}
          placeholder={creating.type === "folder" ? "folder-name" : "file-name.ext"}
          style={{ flex: 1, minWidth: 0, background: "#3c3c3c", border: "1px solid #007acc", color: "#fff", fontSize: 12, padding: "1px 4px", outline: "none" }} />
      </div>
    );
  };

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    const isFolder = node.isFolder;
    const isExpanded = expanded.has(node.fullPath);
    const isActive = !isFolder && node.fullPath === activePath;
    const isRenaming = renamingPath === node.fullPath;
    const children = Array.from(node.children.values()).sort((a, b) => Number(b.isFolder) - Number(a.isFolder) || a.name.localeCompare(b.name));

    return (
      <div key={node.fullPath}>
        <div
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("application/x-codetogether-path", node.fullPath);
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(e) => { if (isFolder) { e.preventDefault(); e.stopPropagation(); } }}
          onDrop={(e) => { if (isFolder) handleDrop(e, node.fullPath); }}
          onClick={() => {
            if (isRenaming) return;
            if (isFolder) {
              setSelectedFolder(node.fullPath);
              setExpanded((prev) => {
                const next = new Set(prev);
                const willExpand = !next.has(node.fullPath);
                if (willExpand) next.add(node.fullPath);
                else next.delete(node.fullPath);
                if (onFolderToggle) onFolderToggle(node.fullPath, willExpand);
                return next;
              });
            } else {
              setSelectedFolder(dirName(node.fullPath));
              onFileSelect(node.fullPath);
            }
          }}
          onDoubleClick={() => { setRenamingPath(node.fullPath); setRenameInput(node.name); }}
          onContextMenu={(e) => handleContextMenu(e, node.fullPath, isFolder)}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: `3px 8px 3px ${8 + depth * 12}px`, cursor: "pointer", background: isActive ? "rgba(255,255,255,0.1)" : selectedFolder === node.fullPath ? "rgba(124,58,237,0.16)" : "transparent" }}
          className="file-item"
        >
          {isFolder ? (isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : <span style={{ width: 13 }} />}
          {isFolder ? (isExpanded ? <FolderOpen size={14} color="#dcb67a" /> : <Folder size={14} color="#dcb67a" />) : (
            getIcon(node.name) ? <span style={{ fontSize: 9, color: getIconColor(node.name), fontWeight: 800, width: 26 }}>{getIcon(node.name)}</span> : <File size={14} color="#858585" />
          )}
          {isRenaming ? (
            <input autoFocus value={renameInput} onChange={e => setRenameInput(e.target.value)} onBlur={handleRenameSubmit}
              onKeyDown={e => { if (e.key === "Enter") handleRenameSubmit(); if (e.key === "Escape") setRenamingPath(null); }}
              style={{ flex: 1, minWidth: 0, background: "#3c3c3c", border: "1px solid #007acc", color: "#fff", fontSize: 12, padding: "0 4px", outline: "none" }} />
          ) : (
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: isActive ? "#fff" : "#cccccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.name}</span>
          )}
          {isFolder && !isRenaming && (
            <span className="folder-actions" style={{ display: "flex", gap: 5 }}>
              <FilePlus size={13} onClick={(e) => { e.stopPropagation(); startCreate("file", node.fullPath); }} />
              <FolderPlus size={13} onClick={(e) => { e.stopPropagation(); startCreate("folder", node.fullPath); }} />
            </span>
          )}
        </div>
        {isFolder && isExpanded && (
          <div>
            {children.map(child => renderNode(child, depth + 1))}
            {renderCreateInput(node.fullPath, depth + 1)}
          </div>
        )}
      </div>
    );
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files ? Array.from(e.target.files) : [];
    if (selectedFiles.length > 0) {
      processUploadedFiles(selectedFiles, selectedFolder);
    }
    if (e.target) e.target.value = "";
  };

  return (
    <div onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, selectedFolder)} style={{ display: "flex", flexDirection: "column", userSelect: "none", height: "100%", background: "var(--vscode-sidebar-bg)" }}>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileInputChange}
        style={{ display: "none" }}
      />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div onClick={() => setOpenEditorsOpen(!openEditorsOpen)} style={{ height: 22, display: "flex", alignItems: "center", background: "#383838", padding: "0 4px", cursor: "pointer" }}>
          {openEditorsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", marginLeft: 4, flex: 1, color: "#fff" }}>Open Editors</span>
        </div>
        {openEditorsOpen && openFileList.map(f => {
          const itemPath = normalizePath(f.path || f.name);
          const isActive = itemPath === activePath;
          return (
            <div key={itemPath} onClick={() => onFileSelect(itemPath)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 16px", background: isActive ? "rgba(255,255,255,0.12)" : "transparent", cursor: "pointer" }}>
              <span style={{ fontSize: 10, color: getIconColor(f.name), fontWeight: 800, width: 26 }}>{getIcon(f.name)}</span>
              <span style={{ fontSize: 13, color: isActive ? "#fff" : "#aaa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{baseName(f.name)}</span>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: 1, minHeight: 0 }}>
        <div onClick={() => setExplorerOpen(!explorerOpen)} style={{ height: 22, display: "flex", alignItems: "center", background: "#383838", padding: "0 4px", cursor: "pointer" }}>
          {explorerOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", marginLeft: 4, flex: 1, color: "#fff" }}>CODETOGETHER</span>
          <div style={{ display: "flex", gap: 6, marginRight: 4 }} onClick={e => e.stopPropagation()}>
            <span title="Upload files/media" onClick={() => fileInputRef.current?.click()} style={{ display: "inline-flex" }}>
              <Upload size={14} className="icon-btn" />
            </span>
            {onOpenProject && (
              <span title="Open local folder" onClick={onOpenProject} style={{ display: "inline-flex" }}>
                <FolderOpen size={14} className="icon-btn" />
              </span>
            )}
            {onSaveProject && (
              <span title="Save project" onClick={onSaveProject} style={{ display: "inline-flex" }}>
                <Save size={14} className="icon-btn" />
              </span>
            )}
            <span title="New file" onClick={() => startCreate("file", selectedFolder)} style={{ display: "inline-flex" }}>
              <FilePlus size={14} className="icon-btn" />
            </span>
            <span title="New folder" onClick={() => startCreate("folder", selectedFolder)} style={{ display: "inline-flex" }}>
              <FolderPlus size={14} className="icon-btn" />
            </span>
          </div>
        </div>

        {explorerOpen && (
          <div style={{ padding: "2px 0", overflow: "auto" }}>
            {projectName && (
              <div style={{ padding: "6px 10px", fontSize: 11, color: "#8bd5ff", borderBottom: "1px solid #2b2b2b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {projectName}
              </div>
            )}
            {Array.from(tree.children.values()).sort((a, b) => Number(b.isFolder) - Number(a.isFolder) || a.name.localeCompare(b.name)).map(node => renderNode(node, 0))}
            {renderCreateInput("", 0)}
          </div>
        )}
      </div>

      <div style={{ flex: 1 }} />

      {contextMenu && (
        <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
          {!contextMenu.isFolder && <div className="context-menu-item" onClick={() => onFileSelect(contextMenu.path)}>Open</div>}
          {contextMenu.isFolder && <div className="context-menu-item" onClick={() => startCreate("file", contextMenu.path)}>New File <FilePlus size={12}/></div>}
          {contextMenu.isFolder && <div className="context-menu-item" onClick={() => startCreate("folder", contextMenu.path)}>New Folder <FolderPlus size={12}/></div>}
          <div className="context-menu-item" onClick={() => setClipboardPath({ path: contextMenu.path, cut: false })}>Copy <Copy size={12}/></div>
          <div className="context-menu-item" onClick={() => setClipboardPath({ path: contextMenu.path, cut: true })}>Cut <Scissors size={12}/></div>
          {contextMenu.isFolder && clipboardPath && (
            <div className="context-menu-item" onClick={() => { copyInto(clipboardPath.path, contextMenu.path, clipboardPath.cut); setClipboardPath(null); }}>
              Paste <Clipboard size={12}/>
            </div>
          )}
          <div className="context-menu-item" onClick={() => { setRenamingPath(contextMenu.path); setRenameInput(baseName(contextMenu.path)); }}>Rename <Edit size={12}/></div>
          <div style={{ height: 1, background: "#3c3c3c", margin: "4px 0" }} />
          <div className="context-menu-item" style={{ color: "#f44747" }} onClick={() => onFileDelete(contextMenu.path)}>Delete <Trash2 size={12}/></div>
        </div>
      )}

      <style jsx>{`
        .icon-btn { color: #858585; cursor: pointer; }
        .icon-btn:hover { color: #fff; }
        .file-item:hover { background: #2a2d2e !important; }
        .folder-actions { color: #858585; opacity: 0; }
        .file-item:hover .folder-actions { opacity: 1; }
        .folder-actions svg:hover { color: #fff; }
      `}</style>
    </div>
  );
}
