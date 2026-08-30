"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import {
  ChevronDown, ChevronRight, FilePlus, FolderPlus, File, Folder, FolderOpen,
  Edit, Trash2, Copy, Clipboard, Scissors, Save, Upload, Terminal, Plus,
  Columns2, Play,
} from "lucide-react";

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

function isPathInside(path: string, parent: string) {
  const cleanPath = normalizePath(path);
  const cleanParent = normalizePath(parent);
  if (!cleanParent) return false;
  return cleanPath === cleanParent || cleanPath.startsWith(`${cleanParent}/`);
}

function getIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return FILE_ICONS[ext] || FILE_ICONS.default;
}

function getIconColor(name: string): string {
  return "#cccccc";
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

function isBinaryLike(file: File) {
  const mediaTypes = ["image/", "video/", "audio/"];
  const binaryTypes = ["application/pdf", "application/zip", "application/x-zip-compressed"];
  return mediaTypes.some((type) => file.type.startsWith(type)) || binaryTypes.includes(file.type);
}

function buildTree(files: FileItem[]): TreeNode {
  const root: TreeNode = { name: "", fullPath: "", isFolder: true, children: new Map() };

  for (const item of files) {
    const fullPath = normalizePath(item.path || item.name);
    if (!fullPath) continue;
    const parts = fullPath.split("/");
    let cursor = root;

    parts.forEach((part, index) => {
      const isLast = index === parts.length - 1;
      const isFolder = isLast ? Boolean(item.isFolder) : true;
      const currentPath = parts.slice(0, index + 1).join("/");

      if (!cursor.children.has(part)) {
        cursor.children.set(part, {
          name: part,
          fullPath: currentPath,
          isFolder,
          file: isLast && !item.isFolder ? item : undefined,
          children: new Map(),
        });
      }
      cursor = cursor.children.get(part)!;
    });
  }

  return root;
}

export default function FileExplorer({
  files,
  activeFile,
  openFileNames = [],
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
  const [internalExpanded, setInternalExpanded] = useState<Set<string>>(new Set(["src", "components"]));
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState("");
  const [createMode, setCreateMode] = useState<{ type: "file" | "folder"; parentPath: string } | null>(null);
  const [createInput, setCreateInput] = useState("");

  const [selectedFolder, setSelectedFolder] = useState<string>("");
  const [openEditorsOpen, setOpenEditorsOpen] = useState(true);
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [terminalSectionOpen, setTerminalSectionOpen] = useState(true);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string; isFolder: boolean } | null>(null);
  const [clipboardPath, setClipboardPath] = useState<{ path: string; cut: boolean } | null>(null);
  const [draggedPath, setDraggedPath] = useState<string | null>(null);
  const [dropTargetPath, setDropTargetPath] = useState<string>("");

  const activePath = normalizePath(activeFile);
  const tree = useMemo(() => buildTree(files), [files]);

  const isExpanded = useCallback((path: string) => {
    if (expandedFolders) return expandedFolders.includes(path);
    return internalExpanded.has(path);
  }, [expandedFolders, internalExpanded]);

  const toggleFolder = useCallback((path: string) => {
    const nextState = !isExpanded(path);
    if (onFolderToggle) {
      onFolderToggle(path, nextState);
    } else {
      setInternalExpanded((prev) => {
        const copy = new Set(prev);
        if (nextState) copy.add(path);
        else copy.delete(path);
        return copy;
      });
    }
  }, [isExpanded, onFolderToggle]);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  const openFileList = useMemo(() => {
    if (!openFileNames.length) return files.filter(f => !f.isFolder);
    const set = new Set(openFileNames.map(normalizePath));
    return files.filter(f => !f.isFolder && set.has(normalizePath(f.path || f.name)));
  }, [files, openFileNames]);

  const processUploadedFiles = useCallback(async (uploadedFiles: File[], parentFolder = "") => {
    for (const file of uploadedFiles) {
      const relativePath = (file as any).webkitRelativePath || file.name;
      const targetPath = parentFolder ? `${parentFolder}/${relativePath}` : relativePath;

      if (isBinaryLike(file)) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = (e.target?.result as string) || "";
          onFileCreate({
            name: baseName(targetPath),
            path: targetPath,
            content: dataUrl,
            language: getLangFromExt(targetPath),
          });
        };
        reader.readAsDataURL(file);
      } else {
        const text = await file.text();
        onFileCreate({
          name: baseName(targetPath),
          path: targetPath,
          content: text,
          language: getLangFromExt(targetPath),
        });
      }
    }
  }, [onFileCreate]);

  const getUniquePath = useCallback((path: string) => {
    const clean = normalizePath(path);
    const existing = new Set(files.map((file) => normalizePath(file.path || file.name)));
    if (!existing.has(clean)) return clean;

    const parent = dirName(clean);
    const name = baseName(clean);
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";

    let index = 1;
    let candidate = clean;
    while (existing.has(candidate)) {
      const copyName = `${stem} copy${index > 1 ? ` ${index}` : ""}${ext}`;
      candidate = parent ? `${parent}/${copyName}` : copyName;
      index += 1;
    }
    return candidate;
  }, [files]);

  const copyPathInto = useCallback((sourcePath: string, targetFolder: string) => {
    const cleanSource = normalizePath(sourcePath);
    const cleanTarget = normalizePath(targetFolder);
    if (cleanTarget && isPathInside(cleanTarget, cleanSource)) return;

    const descendants = files.filter((file) => isPathInside(file.path || file.name, cleanSource));
    if (!descendants.length) return;

    const sourceBase = baseName(cleanSource);
    const nextRoot = getUniquePath(cleanTarget ? `${cleanTarget}/${sourceBase}` : sourceBase);

    descendants.forEach((file) => {
      const currentPath = normalizePath(file.path || file.name);
      const suffix = currentPath === cleanSource ? "" : currentPath.slice(cleanSource.length + 1);
      const nextPath = suffix ? `${nextRoot}/${suffix}` : nextRoot;
      onFileCreate({
        ...file,
        name: baseName(nextPath),
        path: nextPath,
      });
    });
  }, [files, getUniquePath, onFileCreate]);

  const movePathInto = useCallback((sourcePath: string, targetFolder: string) => {
    const cleanSource = normalizePath(sourcePath);
    const cleanTarget = normalizePath(targetFolder);
    if (!cleanSource || cleanSource === cleanTarget || isPathInside(cleanTarget, cleanSource)) return;

    const sourceBase = baseName(cleanSource);
    const targetPath = getUniquePath(cleanTarget ? `${cleanTarget}/${sourceBase}` : sourceBase);
    onFileRename(cleanSource, targetPath);
  }, [getUniquePath, onFileRename]);

  useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
      const fileItems = Array.from(event.clipboardData?.items || [])
        .map((item) => item.kind === "file" ? item.getAsFile() : null)
        .filter((file): file is File => Boolean(file));

      if (!fileItems.length) return;
      event.preventDefault();
      await processUploadedFiles(fileItems, selectedFolder);
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [selectedFolder, processUploadedFiles]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = draggedPath ? "move" : "copy";
  };

  const handleDrop = async (e: React.DragEvent, parentFolder = "") => {
    e.preventDefault();
    e.stopPropagation();
    setDropTargetPath("");

    const internalPath = e.dataTransfer.getData("application/x-codetogether-file") || draggedPath;
    if (internalPath) {
      if (e.altKey) {
        copyPathInto(internalPath, parentFolder);
      } else {
        movePathInto(internalPath, parentFolder);
      }
      setDraggedPath(null);
      return;
    }

    const droppedFiles = Array.from(e.dataTransfer.files || []);
    if (droppedFiles.length > 0) {
      await processUploadedFiles(droppedFiles, parentFolder);
    }
  };

  const pasteInto = (sourcePath: string, targetFolder: string, isCut = false) => {
    if (isCut) {
      movePathInto(sourcePath, targetFolder);
    } else {
      copyPathInto(sourcePath, targetFolder);
    }
  };

  const startRename = (fullPath: string) => {
    setRenamingPath(fullPath);
    setRenameInput(baseName(fullPath));
  };

  const submitRename = (oldFullPath: string) => {
    if (!renameInput.trim()) { setRenamingPath(null); return; }
    const parent = dirName(oldFullPath);
    const newFullPath = parent ? `${parent}/${renameInput.trim()}` : renameInput.trim();
    onFileRename(oldFullPath, newFullPath);
    setRenamingPath(null);
  };

  const startCreate = (type: "file" | "folder", parentPath = "") => {
    setCreateMode({ type, parentPath });
    setCreateInput("");
    if (parentPath && !isExpanded(parentPath)) {
      toggleFolder(parentPath);
    }
  };

  const submitCreate = () => {
    if (!createMode || !createInput.trim()) { setCreateMode(null); return; }
    const name = createInput.trim();
    const fullPath = createMode.parentPath ? `${createMode.parentPath}/${name}` : name;
    if (createMode.type === "file") {
      onFileCreate({ name: baseName(fullPath), path: fullPath, content: "", language: getLangFromExt(fullPath) });
      onFileSelect(fullPath);
    } else {
      onFileCreate({ name: baseName(fullPath), path: fullPath, content: "", language: "folder", isFolder: true });
    }
    setCreateMode(null);
  };

  const renderCreateInput = (parentPath: string, depth: number) => {
    if (!createMode || createMode.parentPath !== parentPath) return null;
    return (
      <div style={{ paddingLeft: depth * 14 + 12 }} className="flex items-center gap-1.5 py-1">
        {createMode.type === "folder" ? <Folder size={14} className="text-gray-400" /> : <File size={14} className="text-gray-400" />}
        <input
          autoFocus
          value={createInput}
          onChange={(e) => setCreateInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submitCreate(); if (e.key === "Escape") setCreateMode(null); }}
          onBlur={submitCreate}
          placeholder={createMode.type === "file" ? "file.js" : "folder"}
          className="bg-ct-dark-black/40 border border-white/20 rounded px-1.5 py-0.5 text-white text-xs outline-none"
        />
      </div>
    );
  };

  const renderNode = (node: TreeNode, depth: number) => {
    const isFolder = node.isFolder;
    const isExpandedFolder = isFolder && isExpanded(node.fullPath);
    const isActive = !isFolder && node.fullPath === activePath;
    const isRenaming = renamingPath === node.fullPath;
    const children = Array.from(node.children.values()).sort((a, b) => Number(b.isFolder) - Number(a.isFolder) || a.name.localeCompare(b.name));

    return (
      <div key={node.fullPath}>
        <div
          onClick={() => {
            if (isFolder) {
              setSelectedFolder(node.fullPath);
              toggleFolder(node.fullPath);
            } else {
              setSelectedFolder(dirName(node.fullPath));
              onFileSelect(node.fullPath);
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu({ x: e.clientX, y: e.clientY, path: node.fullPath, isFolder });
          }}
          draggable={!isRenaming}
          onDragStart={(e) => {
            e.stopPropagation();
            setDraggedPath(node.fullPath);
            e.dataTransfer.effectAllowed = "copyMove";
            e.dataTransfer.setData("application/x-codetogether-file", node.fullPath);
            e.dataTransfer.setData("text/plain", node.fullPath);
          }}
          onDragOver={handleDragOver}
          onDragEnter={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDropTargetPath(isFolder ? node.fullPath : dirName(node.fullPath));
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTargetPath("");
          }}
          onDragEnd={() => {
            setDraggedPath(null);
            setDropTargetPath("");
          }}
          onDrop={(e) => handleDrop(e, isFolder ? node.fullPath : dirName(node.fullPath))}
          style={{ paddingLeft: depth * 14 + 10 }}
          className={`group flex items-center h-[24px] pr-2 cursor-pointer transition-colors ${
            dropTargetPath === (isFolder ? node.fullPath : dirName(node.fullPath))
              ? "bg-white/20 text-white outline outline-1 outline-white/60"
              : isActive ? "bg-white/15 text-white" : "hover:bg-white/5 text-gray-300"
          }`}
        >
          {isFolder ? (
            <span className="mr-1 text-gray-400">
              {isExpandedFolder ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
          ) : <span className="w-4" />}

          {isFolder ? (
            isExpandedFolder ? <FolderOpen size={14} className="mr-1.5 text-white" /> : <Folder size={14} className="mr-1.5 text-gray-400" />
          ) : (
            <span className="text-[10px] text-gray-300 font-extrabold w-[26px] mr-1 shrink-0">{getIcon(node.name)}</span>
          )}

          {isRenaming ? (
            <input
              autoFocus
              value={renameInput}
              onChange={(e) => setRenameInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitRename(node.fullPath); if (e.key === "Escape") setRenamingPath(null); }}
              onBlur={() => submitRename(node.fullPath)}
              className="bg-ct-dark-black/40 border border-white/20 rounded px-1.5 py-0.5 text-white text-xs outline-none"
            />
          ) : (
            <span className="text-[13px] truncate flex-1">{node.name}</span>
          )}

          {isFolder && !isRenaming && (
            <span className="hidden group-hover:flex items-center gap-1 text-gray-400">
              <FilePlus size={13} className="hover:text-white cursor-pointer" onClick={(e) => { e.stopPropagation(); startCreate("file", node.fullPath); }} />
              <FolderPlus size={13} className="hover:text-white cursor-pointer" onClick={(e) => { e.stopPropagation(); startCreate("folder", node.fullPath); }} />
            </span>
          )}
        </div>
        {isFolder && isExpandedFolder && (
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
      <div
        onDragOver={handleDragOver}
        onDragEnter={() => setDropTargetPath(selectedFolder)}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTargetPath("");
        }}
        onDrop={(e) => handleDrop(e, selectedFolder)}
        className="flex flex-col select-none h-full bg-ct-vscode-sidebar text-gray-200"
      >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileInputChange}
        className="hidden"
      />
      <div className="flex flex-col">
        <div onClick={() => setOpenEditorsOpen(!openEditorsOpen)} className="h-[22px] flex items-center bg-[#383838] px-1 cursor-pointer">
          {openEditorsOpen ? <ChevronDown size={14} className="text-white" /> : <ChevronRight size={14} className="text-white" />}
          <span className="text-[11px] font-bold uppercase ml-1 flex-1 text-white">Open Editors</span>
        </div>
        {openEditorsOpen && openFileList.map(f => {
          const itemPath = normalizePath(f.path || f.name);
          const isActive = itemPath === activePath;
          return (
            <div key={itemPath} onClick={() => onFileSelect(itemPath)} className={`flex items-center gap-1.5 px-4 py-0.5 cursor-pointer ${
              isActive ? "bg-white/15 text-white" : "hover:bg-white/5 text-gray-400"
            }`}>
              <span className="text-[10px] text-gray-300 font-extrabold w-[26px]">{getIcon(f.name)}</span>
              <span className="text-[13px] truncate">{baseName(f.name)}</span>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col mt-0.25 min-h-0">
        <div onClick={() => setExplorerOpen(!explorerOpen)} className="h-[22px] flex items-center bg-[#383838] px-1 cursor-pointer">
          {explorerOpen ? <ChevronDown size={14} className="text-white" /> : <ChevronRight size={14} className="text-white" />}
          <span className="text-[11px] font-bold uppercase ml-1 flex-1 text-white">CODETOGETHER</span>
          <div className="flex gap-1.5 mr-1" onClick={e => e.stopPropagation()}>
            <span title="Upload files/media" onClick={() => fileInputRef.current?.click()} className="inline-flex">
              <Upload size={14} className="text-gray-400 hover:text-white cursor-pointer" />
            </span>
            {onOpenProject && (
              <span title="Open local folder" onClick={onOpenProject} className="inline-flex">
                <FolderOpen size={14} className="text-gray-400 hover:text-white cursor-pointer" />
              </span>
            )}
            {onSaveProject && (
              <span title="Save project" onClick={onSaveProject} className="inline-flex">
                <Save size={14} className="text-gray-400 hover:text-white cursor-pointer" />
              </span>
            )}
            <span title="New file" onClick={() => startCreate("file", selectedFolder)} className="inline-flex">
              <FilePlus size={14} className="text-gray-400 hover:text-white cursor-pointer" />
            </span>
            <span title="New folder" onClick={() => startCreate("folder", selectedFolder)} className="inline-flex">
              <FolderPlus size={14} className="text-gray-400 hover:text-white cursor-pointer" />
            </span>
          </div>
        </div>

        {explorerOpen && (
          <div className="py-0.5 overflow-auto">
            {projectName && (
              <div className="px-2.5 py-1.5 text-[11px] text-white font-bold border-b border-[#2b2b2b] truncate">
                {projectName}
              </div>
            )}
            {Array.from(tree.children.values()).sort((a, b) => Number(b.isFolder) - Number(a.isFolder) || a.name.localeCompare(b.name)).map(node => renderNode(node, 0))}
            {renderCreateInput("", 0)}
          </div>
        )}
      </div>

      <div className="flex-1" />

      {contextMenu && (
        <div style={{ top: contextMenu.y, left: contextMenu.x }} className="fixed z-[99999] bg-[#252526] border border-[#454545] shadow-2xl rounded py-1 min-w-[140px]">
          {!contextMenu.isFolder && <div className="px-3 py-1 text-xs text-gray-200 cursor-pointer hover:bg-white/10" onClick={() => onFileSelect(contextMenu.path)}>Open</div>}
          {contextMenu.isFolder && <div className="px-3 py-1 text-xs text-gray-200 cursor-pointer hover:bg-white/10 flex justify-between items-center" onClick={() => startCreate("file", contextMenu.path)}>New File <FilePlus size={12}/></div>}
          {contextMenu.isFolder && <div className="px-3 py-1 text-xs text-gray-200 cursor-pointer hover:bg-white/10 flex justify-between items-center" onClick={() => startCreate("folder", contextMenu.path)}>New Folder <FolderPlus size={12}/></div>}
          <div className="px-3 py-1 text-xs text-gray-200 cursor-pointer hover:bg-white/10 flex justify-between items-center" onClick={() => setClipboardPath({ path: contextMenu.path, cut: false })}>Copy <Copy size={12}/></div>
          <div className="px-3 py-1 text-xs text-gray-200 cursor-pointer hover:bg-white/10 flex justify-between items-center" onClick={() => setClipboardPath({ path: contextMenu.path, cut: true })}>Cut <Scissors size={12}/></div>
          {contextMenu.isFolder && clipboardPath && (
            <div className="px-3 py-1 text-xs text-gray-200 cursor-pointer hover:bg-white/10 flex justify-between items-center" onClick={() => { pasteInto(clipboardPath.path, contextMenu.path, clipboardPath.cut); setClipboardPath(null); }}>
              Paste <Clipboard size={12}/>
            </div>
          )}
          <div className="px-3 py-1 text-xs text-gray-200 cursor-pointer hover:bg-white/10 flex justify-between items-center" onClick={() => { setRenamingPath(contextMenu.path); setRenameInput(baseName(contextMenu.path)); }}>Rename <Edit size={12}/></div>
          <div className="h-px bg-[#3c3c3c] my-1" />
          <div className="px-3 py-1 text-xs text-red-400 cursor-pointer hover:bg-red-500/20 flex justify-between items-center" onClick={() => onFileDelete(contextMenu.path)}>Delete <Trash2 size={12}/></div>
        </div>
      )}
    </div>
  );
}
