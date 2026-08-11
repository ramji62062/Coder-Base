"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Editor from "@/components/Editor";
import EditorTabs from "@/components/EditorTabs";
import RoomTopbar from "@/components/RoomTopbar";
import ActivityBar from "@/components/ActivityBar";
import LeftSidebar from "@/components/LeftSidebar";
import StatusBar from "@/components/StatusBar";
import TerminalPanel from "@/components/TerminalPanel";
import ToastContainer, { type ToastData } from "@/components/Toast";
import BreadcrumbBar from "@/components/BreadcrumbBar";
import { type FileItem } from "@/components/FileExplorer";
import { supabase } from "@/lib/supabase";
import { type RemoteCursor } from "@/components/Editor";
import { Eye, Play } from "lucide-react";

type Room = {
  id: string;
  name: string | null;
  room_code: string;
  language: string;
  code_content: string | null;
  files_json: FileItem[] | null;
  created_by: string | null;
  is_active: boolean | null;
};

type PresenceMember = { userId: string; name: string; avatar?: string | null };
type Breakpoint = { file: string; line: number };
type FileSystemDirectoryHandleLike = any;
type FileSystemFileHandleLike = any;
type CollaboratorCursor = RemoteCursor & { updatedAt: number };

function getDefaultFiles(lang: string): FileItem[] {
  const map: Record<string, { name: string; content: string; language: string }> = {
    javascript: { name: "main.js", content: '// Welcome to CodeTogether!\nconsole.log("Hello, world!");\n', language: "javascript" },
    typescript: { name: "main.ts", content: '// Welcome to CodeTogether!\nconsole.log("Hello, world!");\n', language: "typescript" },
    python: { name: "main.py", content: '# Welcome to CodeTogether!\nprint("Hello, world!")\n', language: "python" },
    java: { name: "Main.java", content: 'public class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello, world!");\n  }\n}\n', language: "java" },
    cpp: { name: "main.cpp", content: '#include <iostream>\nint main() {\n  std::cout << "Hello, world!" << std::endl;\n  return 0;\n}\n', language: "cpp" },
    c: { name: "main.c", content: '#include <stdio.h>\nint main() {\n  printf("Hello, world!\\n");\n  return 0;\n}\n', language: "c" },
    go: { name: "main.go", content: 'package main\n\nimport "fmt"\n\nfunc main() {\n  fmt.Println("Hello, world!")\n}\n', language: "go" },
    rust: { name: "main.rs", content: 'fn main() {\n  println!("Hello, world!");\n}\n', language: "rust" },
    shell: { name: "main.sh", content: 'echo "Hello, world!"\n', language: "shell" },
    php: { name: "main.php", content: '<?php\necho "Hello, world!\\n";\n', language: "php" },
    ruby: { name: "main.rb", content: 'puts "Hello, world!"\n', language: "ruby" },
    html: { name: "index.html", content: '<!doctype html>\n<html>\n  <body>\n    <h1>Hello, world!</h1>\n  </body>\n</html>\n', language: "html" },
    css: { name: "style.css", content: 'body {\n  font-family: sans-serif;\n  color: #ffffff;\n  background: #111827;\n}\n', language: "css" },
  };
  const main = map[lang] || map.javascript!;
  return [main, { name: "README.md", content: "# CodeTogether Room\n\nCollaborative coding session.\n", language: "markdown" }];
}

function parseRoomMeta(roomName: string | null) {
  if (!roomName || !roomName.startsWith("{")) return {};
  try {
    return JSON.parse(roomName);
  } catch {
    return {};
  }
}

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
}

function normalizeFileItem(file: FileItem): FileItem {
  const path = normalizePath(file.path || file.name);
  return { ...file, name: path, path };
}

function isPathInside(path: string, parent: string) {
  const cleanPath = normalizePath(path);
  const cleanParent = normalizePath(parent);
  return cleanPath === cleanParent || cleanPath.startsWith(`${cleanParent}/`);
}

function getFolderPaths(files: FileItem[]) {
  const folders = new Set<string>();
  for (const file of files) {
    const path = normalizePath(file.path || file.name);
    const parts = path.split("/");
    for (let i = 0; i < parts.length - 1; i++) {
      folders.add(parts.slice(0, i + 1).join("/"));
    }
  }
  return Array.from(folders);
}

function getParentDirectory(path: string) {
  const normalized = normalizePath(path);
  const parts = normalized.split("/");
  parts.pop();
  return parts.join("/");
}

function resolvePreviewPath(basePath: string, relativePath: string) {
  const rel = normalizePath(relativePath.replace(/^\//, ""));
  const baseDir = getParentDirectory(basePath);
  return normalizePath([baseDir, rel].filter(Boolean).join("/"));
}

function getPreviewHtmlFile(files: FileItem[], activeFile: string) {
  const fileMap = new Map(files.map((file) => [normalizePath(file.path || file.name), file]));
  const activeKey = normalizePath(activeFile);
  const activeFileItem = fileMap.get(activeKey);

  if (activeFileItem?.language === "html") {
    return activeFileItem;
  }

  return fileMap.get("index.html")
    || fileMap.get("index.htm")
    || Array.from(fileMap.values()).find((file) => file.language === "html");
}

function buildProjectPreview(files: FileItem[]): string {
  const htmlFile = files.find(f => f.name === "index.html" || f.language === "html");
  if (!htmlFile) {
    return `<html><body style="font-family:sans-serif;padding:40px;background:#fff">
      <h2>No HTML file found</h2>
      <p>Create an index.html file to preview your project.</p>
    </body></html>`;
  }
  
  const cssFiles = files.filter(f => f.language === "css");
  const jsFiles = files.filter(f => f.language === "javascript");
  
  let html = htmlFile.content || "";
  
  const cssMap = new Map(cssFiles.map(f => [f.name, f.content || ""]));
  const jsMap = new Map(jsFiles.map(f => [f.name, f.content || ""]));
  
  html = html.replace(/<link[^>]*href=["']([^"']+)["'][^>]*>/gi, (match, href) => {
    if (href.endsWith(".css")) {
      const css = cssMap.get(href) || cssMap.get(href.replace("./", ""));
      if (css) return `<style>${css}</style>`;
    }
    return match;
  });
  
  html = html.replace(/<script[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (match, src) => {
    if (src.endsWith(".js")) {
      const js = jsMap.get(src) || jsMap.get(src.replace("./", ""));
      if (js) return `<script>${js}</script>`;
    }
    return match;
  });
  
  if (!/<meta[^>]*charset/i.test(html)) {
    html = html.replace(/<head/i, '<head><meta charset="UTF-8">');
  }
  
  return html;
}

function buildFolderPreview(files: FileItem[], folderName: string): string {
  const folderFiles = files.filter(f => f.name.startsWith(folderName) || (f.path && f.path.includes(folderName)));
  const htmlFile = folderFiles.find(f => f.language === "html");
  
  if (!htmlFile) {
    return `<html><body style="font-family:sans-serif;padding:40px;background:#fff">
      <h2>No HTML file in "${folderName}"</h2>
      <p>Add an HTML file to this folder to preview it.</p>
    </body></html>`;
  }
  
  const cssFiles = folderFiles.filter(f => f.language === "css");
  const jsFiles = folderFiles.filter(f => f.language === "javascript");
  
  let html = htmlFile.content || "";
  
  const cssMap = new Map(cssFiles.map(f => [f.name, f.content || ""]));
  const jsMap = new Map(jsFiles.map(f => [f.name, f.content || ""]));
  
  html = html.replace(/<link[^>]*href=["']([^"']+)["'][^>]*>/gi, (match, href) => {
    if (href.endsWith(".css")) {
      const css = cssMap.get(href) || cssMap.get(href.replace("./", ""));
      if (css) return `<style>${css}</style>`;
    }
    return match;
  });
  
  html = html.replace(/<script[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (match, src) => {
    if (src.endsWith(".js")) {
      const js = jsMap.get(src) || jsMap.get(src.replace("./", ""));
      if (js) return `<script>${js}</script>`;
    }
    return match;
  });
  
  if (!/<meta[^>]*charset/i.test(html)) {
    html = html.replace(/<head/i, '<head><meta charset="UTF-8">');
  }
  
  return html;
}

function buildPreviewSrcDoc(files: FileItem[], activeFile: string) {
  const htmlFile = getPreviewHtmlFile(files, activeFile);

  if (!htmlFile || htmlFile.language !== "html") {
    return "";
  }

  const fileMap = new Map(files.map((file) => [normalizePath(file.path || file.name), file]));
  let html = htmlFile.content || "";

  const cssMap = new Map(
    Array.from(fileMap.values())
      .filter((file) => file.language === "css")
      .map((file) => [normalizePath(file.path || file.name), file.content || ""]),
  );

  const jsMap = new Map(
    Array.from(fileMap.values())
      .filter((file) => file.language === "javascript")
      .map((file) => [normalizePath(file.path || file.name), file.content || ""]),
  );

  html = html.replace(/<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi, (match, href) => {
    const resolved = resolvePreviewPath(htmlFile.path || htmlFile.name, href);
    const css = cssMap.get(resolved);
    if (css !== undefined) {
      return `<style>${css}</style>`;
    }
    return match;
  });

  html = html.replace(/<script[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (match, src) => {
    const resolved = resolvePreviewPath(htmlFile.path || htmlFile.name, src);
    const js = jsMap.get(resolved);
    if (js !== undefined) {
      return `<script>${js}</script>`;
    }
    return match;
  });

  if (!/<meta[^>]*charset/i.test(html)) {
    if (/<head[^>]*>/i.test(html)) {
      html = html.replace(/<head([^>]*)>/i, `<head$1>\n<meta charset=\"utf-8\">`);
    } else {
      html = `<!doctype html><html><head><meta charset=\"utf-8\"></head><body>${html}</body></html>`;
    }
  }

  return html;
}

function getLangFromPath(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
    py: "python", java: "java", cpp: "cpp", cc: "cpp", cxx: "cpp", c: "c",
    cs: "csharp", go: "go", rs: "rust", php: "php", rb: "ruby", kt: "kotlin",
    kts: "kotlin", swift: "swift", scala: "scala", pl: "perl", r: "r", lua: "lua",
    dart: "dart", sh: "shell", bash: "shell", html: "html", css: "css",
    json: "json", md: "markdown", txt: "plaintext",
  };
  return map[ext] || "plaintext";
}

async function readProjectDirectory(rootHandle: FileSystemDirectoryHandleLike) {
  const files: FileItem[] = [];
  const handles = new Map<string, FileSystemFileHandleLike>();
  const ignored = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage", ".turbo", ".cache"]);

  async function walk(dirHandle: FileSystemDirectoryHandleLike, prefix = "") {
    for await (const [name, handle] of dirHandle.entries()) {
      if (name.startsWith(".") && name !== ".env") continue;
      if (ignored.has(name)) continue;
      const path = normalizePath([prefix, name].filter(Boolean).join("/"));
      if (handle.kind === "directory") {
        files.push({ name: path, path, content: "", language: "folder", isFolder: true });
        await walk(handle, path);
      } else if (handle.kind === "file") {
        const file = await handle.getFile();
        if (file.size > 512 * 1024) continue;
        const content = await file.text();
        files.push({ name: path, path, content, language: getLangFromPath(path) });
        handles.set(path, handle);
      }
    }
  }

  await walk(rootHandle);
  return { files: files.map(normalizeFileItem), handles };
}

export default function RoomPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const roomId = useMemo(() => params?.id || "", [params]);

  // Room
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentUserName, setCurrentUserName] = useState("User");
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [nicknameModalOpen, setNicknameModalOpen] = useState(false);
  const [tempNickname, setTempNickname] = useState("");
  const [language, setLanguage] = useState("javascript");
  const [roomName, setRoomName] = useState("");
  const [members, setMembers] = useState<PresenceMember[]>([]);
  const roomChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Files
  const [files, setFiles] = useState<FileItem[]>([]);
  const [activeFile, setActiveFile] = useState("");
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [modifiedFiles, setModifiedFiles] = useState<Set<string>>(new Set());
  const [projectName, setProjectName] = useState("Cloud workspace");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set(["src"]));
  const [remoteCursors, setRemoteCursors] = useState<Record<string, CollaboratorCursor>>({});
  const directoryHandleRef = useRef<FileSystemDirectoryHandleLike | null>(null);
  const fileHandlesRef = useRef<Map<string, FileSystemFileHandleLike>>(new Map());

  // UI
  const [scheduleStatus, setScheduleStatus] = useState<{
    status: "allowed" | "not_invited" | "not_started" | "expired";
    startAt: string | null;
    endAt: string | null;
  }>({ status: "allowed", startAt: null, endAt: null });

  const [activePanel, setActivePanel] = useState<string>("files");
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFullscreen, setPreviewFullscreen] = useState(false);
  const [projectPreviewUrl, setProjectPreviewUrl] = useState<string | null>(null);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [syncStatus, setSyncStatus] = useState<"synced" | "syncing" | "saved">("synced");
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorCol, setCursorCol] = useState(1);
  const [wordWrap, setWordWrap] = useState(false);
  const [previewMode, setPreviewMode] = useState<"file" | "folder" | "project">("file");
  const [previewTarget, setPreviewTarget] = useState<string>("");

  // Media
  const [micOn, setMicOn] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [screenOn, setScreenOn] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCallJoined, setIsCallJoined] = useState(false);

  // Publish states
  const [publishOpen, setPublishOpen] = useState(false);
  const [pubTitle, setPubTitle] = useState("");
  const [pubDesc, setPubDesc] = useState("");
  const [pubCat, setPubCat] = useState("Tutorials");
  const [pubAuthor, setPubAuthor] = useState("");
  const [pubVisibility, setPubVisibility] = useState<"public" | "private">("public");
  const [pubAccessCode, setPubAccessCode] = useState("");
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (publishOpen) {
      setPubTitle(roomName || "");
      setPubAuthor(currentUserName || "");
    }
  }, [publishOpen, roomName, currentUserName]);

  const handleScreenToggle = useCallback((val?: boolean) => {
    setActivePanel("participants");
    setScreenOn((prev) => (val !== undefined ? val : !prev));
  }, []);

  async function handlePublishToLibrary() {
    const title = pubTitle.trim();
    const author = pubAuthor.trim();
    const desc = pubDesc.trim();

    if (!title || !author) {
      alert("Title and Author Name are required.");
      return;
    }
    if (!currentUserId) {
      addToast("Unable to publish: user session not loaded.", "error");
      return;
    }
    if (pubVisibility === "private" && !pubAccessCode.trim()) {
      addToast("Private library publishing requires a passcode.", "error");
      return;
    }

    const publishFiles = files
      .filter((file) => !file.isFolder)
      .map((file) => ({ name: file.name, content: file.content, language: file.language }));

    if (publishFiles.length === 0) {
      addToast("No code files are available to publish.", "error");
      return;
    }

    setPublishing(true);
    try {
      const codeCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const libraryNameObj = {
        isLibrary: true,
        isPrivate: pubVisibility === "private",
        followersOnly: pubVisibility === "private",
        accessCode: pubVisibility === "private" ? pubAccessCode.trim() : "",
        title,
        description: desc,
        category: pubCat,
        authorName: author,
      };

      const { error } = await supabase
        .from("rooms")
        .insert({
          name: JSON.stringify(libraryNameObj),
          room_code: codeCode,
          created_by: currentUserId,
          language: language,
          files_json: publishFiles,
          is_active: false,
        });

      if (error) {
        throw new Error(error.message);
      }

      addToast(pubVisibility === "private" ? "Workspace published to Private Library!" : "Workspace successfully published to Shared Library!", "success");
      setPublishOpen(false);
      setPubDesc("");
      setPubAccessCode("");
      setPubVisibility("public");
    } catch (err: any) {
      console.error(err);
      addToast(err.message || "Failed to publish workspace.", "error");
    } finally {
      setPublishing(false);
    }
  }


  // Chat / Debug
  const [unreadChat, setUnreadChat] = useState(0);
  const [breakpoints, setBreakpoints] = useState<Breakpoint[]>([]);

  // Toasts
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const codeRef = useRef("");
  const saveRef = useRef<(() => void) | null>(null);
  const filesSaveTimer = useRef<NodeJS.Timeout | null>(null);
  const cursorSendTimer = useRef<NodeJS.Timeout | null>(null);
  const codeBroadcastTimer = useRef<NodeJS.Timeout | null>(null);
  const activeFileRef = useRef("");

  const addToast = useCallback((message: string, type: "info" | "error" | "success" = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);
  const dismissToast = useCallback((id: string) => { setToasts((prev) => prev.filter((t) => t.id !== id)); }, []);

  useEffect(() => {
    activeFileRef.current = activeFile;
  }, [activeFile]);

  // ── Bootstrap ──
  useEffect(() => {
    async function bootstrap() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) { router.replace("/login"); return; }
      setCurrentUserId(session.user.id);
      const { data: profile } = await supabase.from("users").select("name, email, avatar_url").eq("id", session.user.id).maybeSingle();
      const defaultName = profile?.name || (profile?.email ? profile.email.split("@")[0] : "") || (session.user.email ? session.user.email.split("@")[0] : "") || "User";
      setUserAvatar(profile?.avatar_url || null);

      const storedNick = typeof window !== "undefined" ? sessionStorage.getItem(`codetogether_nickname_${roomId}`) : null;
      if (storedNick) {
        setCurrentUserName(storedNick);
      } else {
        setTempNickname(defaultName);
        setNicknameModalOpen(true);
        setCurrentUserName(defaultName);
      }

      const { data, error: roomError } = await supabase.from("rooms")
        .select("id, name, room_code, language, code_content, files_json, created_by, is_active")
        .eq("id", roomId).maybeSingle();

      if (roomError || !data) { router.replace("/dashboard"); setLoading(false); return; }

      const roomMeta: any = parseRoomMeta(data.name);

      if ((roomMeta.isPrivate || roomMeta.accessCode) && data.created_by !== session.user.id) {
        const { data: participant } = await supabase
          .from("room_participants")
          .select("id")
          .eq("room_id", data.id)
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (!participant) {
          addToast("Enter the room code and access code to join this private room.", "error");
          router.replace("/dashboard");
          setLoading(false);
          return;
        }
      }

      // Parse scheduling metadata from name
      let schedule = { isScheduled: false, startAt: null, endAt: null, invitedEmails: [] };
      if (roomMeta.isScheduled) {
        schedule = {
          isScheduled: true,
          startAt: roomMeta.startAt,
          endAt: roomMeta.endAt,
          invitedEmails: roomMeta.invitedEmails || [],
        };
      }

      if (schedule.isScheduled) {
        const now = Date.now();
        const startMs = schedule.startAt ? new Date(schedule.startAt).getTime() : 0;
        const endMs = schedule.endAt ? new Date(schedule.endAt).getTime() : 0;
        const isCreator = data.created_by === session.user.id;
        const isInvited = schedule.invitedEmails.some((e: string) => e.toLowerCase() === (session.user.email || "").toLowerCase());

        if (!isCreator && !isInvited) {
          setScheduleStatus({ status: "not_invited", startAt: schedule.startAt, endAt: schedule.endAt });
          setLoading(false);
          return;
        } else if (now < startMs) {
          setScheduleStatus({ status: "not_started", startAt: schedule.startAt, endAt: schedule.endAt });
          setLoading(false);
          return;
        } else if (now > endMs) {
          setScheduleStatus({ status: "expired", startAt: schedule.startAt, endAt: schedule.endAt });
          setLoading(false);
          return;
        }
      }

      if (data.is_active === false && data.created_by !== session.user.id) {
        router.replace("/dashboard");
        setLoading(false);
        return;
      }
      setRoom(data);
      setLanguage(data.language || "javascript");
      setRoomName(data.name || "Untitled Room");

      // Initialize files
      let initialFiles: FileItem[] = [];
      if (data.files_json && Array.isArray(data.files_json) && data.files_json.length > 0) {
        initialFiles = data.files_json.map(normalizeFileItem);
      } else if (data.code_content) {
        // Migrate from old single-file format
        const ext = data.language === "python" ? "py" : data.language === "typescript" ? "ts" : "js";
        initialFiles = [
          { name: `main.${ext}`, content: data.code_content, language: data.language || "javascript" },
          { name: "README.md", content: "# CodeTogether Room\n", language: "markdown" },
        ].map(normalizeFileItem);
      } else {
        initialFiles = getDefaultFiles(data.language || "javascript").map(normalizeFileItem);
      }
      setFiles(initialFiles);
      const firstFile = initialFiles.find(f => !f.isFolder);
      setActiveFile(firstFile?.name || "");
      setOpenTabs(firstFile ? [firstFile.name] : []);

      await supabase.from("room_participants").upsert(
        { room_id: roomId, user_id: session.user.id },
        { onConflict: "room_id,user_id", ignoreDuplicates: true },
      );

      if (typeof window !== "undefined") {
        (window as any).currentUserDisplayPath = defaultName;
      }
      setLoading(false);
    }
    if (roomId) bootstrap();
  }, [roomId, router]);

  // ── Save files to Supabase (debounced) ──
  const saveFilesToDb = useCallback((filesToSave: FileItem[]) => {
    if (filesSaveTimer.current) clearTimeout(filesSaveTimer.current);
    filesSaveTimer.current = setTimeout(async () => {
      await supabase.from("rooms").update({ files_json: filesToSave }).eq("id", roomId);
    }, 500);
  }, [roomId]);

  // ── Presence channel ──
  useEffect(() => {
    if (!roomId || !currentUserId || loading) return;
    const channel = supabase.channel(`room:${roomId}`, { config: { presence: { key: currentUserId } } });
    roomChannelRef.current = channel;
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const next: PresenceMember[] = [];
        Object.values(state).forEach((presences: any) => { const c = presences?.[0]; if (c) next.push({ userId: c.userId, name: c.name || "Guest", avatar: c.avatar || null }); });
        setMembers(next);
      })
      .on("broadcast", { event: "language-change" }, ({ payload }: any) => {
        if (payload.userId !== currentUserId && payload.language) setLanguage(payload.language);
      })
      .on("broadcast", { event: "files-update" }, ({ payload }: any) => {
        // Only handle structural changes (file create/delete/rename/open-project)
        // NOT code content changes (handled by code-update event)
        if (payload.userId !== currentUserId && payload.files) {
          const nextFiles = payload.files.map(normalizeFileItem);
          const currentActiveFile = activeFileRef.current;
          // Preserve local file content to avoid clobbering what the user is typing
          setFiles((prev) => {
            const prevByPath = new Map(prev.map((f) => [normalizePath(f.path || f.name), f]));
            return nextFiles.map((f: FileItem) => {
              const path = normalizePath(f.path || f.name);
              const local = prevByPath.get(path);
              // Keep local content for the active file being edited; take remote otherwise
              return local && path === activeFileRef.current ? local : f;
            });
          });
          if (!nextFiles.some((file: FileItem) => normalizePath(file.path || file.name) === currentActiveFile && !file.isFolder)) {
            const firstFile = nextFiles.find((file: FileItem) => !file.isFolder);
            if (firstFile) {
              setActiveFile(firstFile.name);
              setOpenTabs((prev) => prev.includes(firstFile.name) ? prev : [...prev, firstFile.name]);
            }
          }
        }
      })
      .on("broadcast", { event: "code-update" }, ({ payload }: any) => {
        // Apply remote code changes to a specific file without touching local editor
        if (payload.userId !== currentUserId && payload.file && payload.content !== undefined) {
          setFiles((prev) =>
            prev.map((f) =>
              normalizePath(f.path || f.name) === normalizePath(payload.file)
                ? { ...f, content: payload.content }
                : f
            )
          );
        }
      })
      .on("broadcast", { event: "project-opened" }, ({ payload }: any) => {
        if (payload.userId === currentUserId) return;
        const applyProject = async () => {
          let nextFiles: FileItem[] | null = null;
          if (Array.isArray(payload.files) && payload.files.length > 0) {
            nextFiles = payload.files.map(normalizeFileItem);
          } else {
            const { data, error } = await supabase.from("rooms").select("files_json").eq("id", roomId).maybeSingle();
            if (error || !data?.files_json) return;
            nextFiles = (data.files_json || []).map(normalizeFileItem);
          }

          const nextActiveFile = normalizePath(payload.activeFile || nextFiles?.find((file: FileItem) => !file.isFolder)?.name || "");
          setProjectName(payload.projectName || "Shared project");
          if (nextFiles) {
            setFiles(nextFiles);
          }
          const expanded = Array.isArray(payload.expandedFolders) && payload.expandedFolders.length > 0
            ? payload.expandedFolders.map(normalizePath)
            : getFolderPaths(nextFiles || []);
          setExpandedFolders(new Set(expanded));
          if (nextActiveFile) {
            setActiveFile(nextActiveFile);
          }
          setOpenTabs(payload.openTabs && Array.isArray(payload.openTabs) && payload.openTabs.length > 0
            ? payload.openTabs.map(normalizePath)
            : nextActiveFile ? [nextActiveFile] : []);
          addToast(`${payload.userName || "A collaborator"} opened ${payload.projectName || "a project"}`, "info");
        };
        void applyProject();
      })
      .on("broadcast", { event: "folder-toggle" }, ({ payload }: any) => {
        if (payload.userId === currentUserId || !payload.folder) return;
        setExpandedFolders((prev) => {
          const next = new Set(prev);
          if (payload.expanded) next.add(payload.folder);
          else next.delete(payload.folder);
          return next;
        });
      })
      .on("broadcast", { event: "cursor-position" }, ({ payload }: any) => {
        if (payload.userId === currentUserId || !payload.file) return;
        setRemoteCursors((prev) => ({
          ...prev,
          [payload.userId]: {
            userId: payload.userId,
            name: payload.name || "Guest",
            file: normalizePath(payload.file),
            line: Number(payload.line) || 1,
            col: Number(payload.col) || 1,
            color: payload.color || "#22d3ee",
            updatedAt: Date.now(),
          },
        }));
      })
      .on("broadcast", { event: "session-ended" }, ({ payload }: any) => {
        if (payload.userId !== currentUserId && room?.created_by !== currentUserId) {
          addToast("This session has ended.", "error");
          router.replace("/dashboard");
        }
      })
      .subscribe(async (status: string) => {
        if (status === "SUBSCRIBED") await channel.track({ userId: currentUserId, name: currentUserName, avatar: null });
      });
    return () => { supabase.removeChannel(channel); roomChannelRef.current = null; };
  }, [roomId, currentUserId, currentUserName, loading, room?.created_by, router, addToast]);

  // ── File operations ──
  const handleFileSelect = useCallback((name: string) => {
    const path = normalizePath(name);
    const target = files.find(f => normalizePath(f.path || f.name) === path && !f.isFolder);
    if (!target) return;
    setActiveFile(path);
    if (!openTabs.includes(path)) setOpenTabs((prev) => [...prev, path]);
  }, [openTabs, files]);

  const handleFolderToggle = useCallback((folder: string, expanded: boolean) => {
    const normalized = normalizePath(folder);
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (expanded) next.add(normalized);
      else next.delete(normalized);
      return next;
    });
    roomChannelRef.current?.send({ type: "broadcast", event: "folder-toggle", payload: { folder: normalized, expanded, userId: currentUserId } });
  }, [currentUserId]);

  const writeFileToLocalProject = useCallback(async (path: string, content: string) => {
    const cleanPath = normalizePath(path);
    let handle = fileHandlesRef.current.get(cleanPath);
    const rootHandle = directoryHandleRef.current;

    if (!handle && rootHandle) {
      const parts = cleanPath.split("/").filter(Boolean);
      const fileName = parts.pop();
      if (!fileName) return;
      let dirHandle = rootHandle;
      for (const part of parts) {
        dirHandle = await dirHandle.getDirectoryHandle(part, { create: true });
      }
      handle = await dirHandle.getFileHandle(fileName, { create: true });
      fileHandlesRef.current.set(cleanPath, handle);
    }

    if (!handle) return;
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
  }, []);

  const handleSaveProject = useCallback(async () => {
    if (!directoryHandleRef.current) {
      addToast("Open a local folder first to save files back to your PC.", "info");
      saveFilesToDb(files);
      return;
    }

    try {
      for (const file of files) {
        if (!file.isFolder) await writeFileToLocalProject(file.path || file.name, file.content || "");
      }
      setModifiedFiles(new Set());
      setSyncStatus("saved");
      addToast("Project saved to your PC", "success");
    } catch {
      addToast("Could not save to local folder. Re-open it and allow write access.", "error");
    }
  }, [addToast, files, saveFilesToDb, writeFileToLocalProject]);

  useEffect(() => {
    saveRef.current = handleSaveProject;
  }, [handleSaveProject]);

  const handleOpenProject = useCallback(async () => {
    const picker = (window as any).showDirectoryPicker;
    if (!picker) {
      addToast("Your browser does not support opening folders. Drag files into Explorer instead.", "error");
      return;
    }

    try {
      const rootHandle = await picker({ mode: "readwrite" });
      const { files: projectFiles, handles } = await readProjectDirectory(rootHandle);
      if (projectFiles.length === 0) {
        addToast("No readable files found in that folder.", "info");
        return;
      }

      directoryHandleRef.current = rootHandle;
      fileHandlesRef.current = handles;
      const firstFile = projectFiles.find((file) => !file.isFolder);
      setProjectName(rootHandle.name || "Local project");
      setFiles(projectFiles);
      setOpenTabs(firstFile ? [firstFile.name] : []);
      setActiveFile(firstFile?.name || "");
      setModifiedFiles(new Set());
      await supabase.from("rooms").update({ files_json: projectFiles }).eq("id", roomId);
      await roomChannelRef.current?.send({
        type: "broadcast",
        event: "project-opened",
        payload: {
          files: projectFiles,
          activeFile: firstFile?.name || "",
          projectName: rootHandle.name || "Local project",
          expandedFolders: getFolderPaths(projectFiles),
          openTabs: firstFile ? [firstFile.name] : [],
          userId: currentUserId,
          userName: currentUserName,
        },
      });
      addToast(`${rootHandle.name || "Project"} opened and shared with the room`, "success");
    } catch (err: any) {
      if (err?.name !== "AbortError") addToast("Could not open that project folder.", "error");
    }
  }, [addToast, currentUserId, currentUserName, saveFilesToDb]);

  const handleFileCreate = useCallback((file: FileItem) => {
    const nextFile = normalizeFileItem(file);
    setFiles((prev) => {
      if (prev.some(f => normalizePath(f.path || f.name) === nextFile.name)) return prev;
      const next = [...prev, nextFile];
      if (!nextFile.isFolder) {
        setActiveFile(nextFile.name);
        setOpenTabs((o) => o.includes(nextFile.name) ? o : [...o, nextFile.name]);
      }
      // Broadcast structural change to peers
      roomChannelRef.current?.send({ type: "broadcast", event: "files-update", payload: { files: next, userId: currentUserId } });
      return next;
    });
  }, [currentUserId]);

  const handleTerminalFilesSync = useCallback((syncedFiles: FileItem[]) => {
    const normalized = syncedFiles.map(normalizeFileItem);
    setFiles((prev) => {
      const byPath = new Map(prev.map((file) => [normalizePath(file.path || file.name), file]));
      normalized.forEach((file) => byPath.set(file.name, file));
      const next = Array.from(byPath.values()).sort((a, b) => normalizePath(a.path || a.name).localeCompare(normalizePath(b.path || b.name)));
      // Broadcast so peers see new/updated files from terminal
      roomChannelRef.current?.send({ type: "broadcast", event: "files-update", payload: { files: next, userId: currentUserId } });
      return next;
    });
  }, [currentUserId]);

  const handleFileDelete = useCallback((name: string) => {
    const path = normalizePath(name);
    setFiles((prev) => {
      const next = prev.filter((f) => !isPathInside(f.path || f.name, path));
      setOpenTabs((o) => o.filter((t) => !isPathInside(t, path)));
      if (isPathInside(activeFile, path)) setActiveFile(next.find(f => !f.isFolder)?.name || "");
      // Broadcast structural change to peers
      roomChannelRef.current?.send({ type: "broadcast", event: "files-update", payload: { files: next, userId: currentUserId } });
      return next;
    });
  }, [activeFile, currentUserId]);

  // Sync files to DB only (no broadcast here — code changes use code-update event)
  useEffect(() => {
    if (loading || files.length === 0) return;
    saveFilesToDb(files);
  }, [files, loading, saveFilesToDb]);

  const handleFileRename = useCallback((oldName: string, newName: string) => {
    const oldPath = normalizePath(oldName);
    const newPath = normalizePath(newName);
    const next = files.map((f) => {
      const path = normalizePath(f.path || f.name);
      if (!isPathInside(path, oldPath)) return f;
      const renamedPath = path === oldPath ? newPath : normalizePath(`${newPath}/${path.slice(oldPath.length + 1)}`);
      return { ...f, name: renamedPath, path: renamedPath };
    });
    setFiles(next);
    setOpenTabs((prev) => prev.map((t) => isPathInside(t, oldPath) ? (t === oldPath ? newPath : normalizePath(`${newPath}/${t.slice(oldPath.length + 1)}`)) : t));
    if (isPathInside(activeFile, oldPath)) setActiveFile(activeFile === oldPath ? newPath : normalizePath(`${newPath}/${activeFile.slice(oldPath.length + 1)}`));
    setBreakpoints((prev) => prev.map((bp) => isPathInside(bp.file, oldPath) ? { ...bp, file: bp.file === oldPath ? newPath : normalizePath(`${newPath}/${bp.file.slice(oldPath.length + 1)}`) } : bp));
    saveFilesToDb(next);
    roomChannelRef.current?.send({ type: "broadcast", event: "files-update", payload: { files: next, userId: currentUserId } });
  }, [files, activeFile, saveFilesToDb, currentUserId]);

  const handleCodeChange = useCallback((newCode: string) => {
    setFiles((prev) =>
      prev.map((f) => normalizePath(f.path || f.name) === activeFile ? { ...f, content: newCode } : f)
    );
    setModifiedFiles((prev) => new Set(prev).add(activeFile));
    setSyncStatus("syncing");
    // Debounce broadcast so peers get code changes without a full files-array flood
    if (codeBroadcastTimer.current) clearTimeout(codeBroadcastTimer.current);
    codeBroadcastTimer.current = setTimeout(() => {
      roomChannelRef.current?.send({
        type: "broadcast",
        event: "code-update",
        payload: { file: activeFile, content: newCode, userId: currentUserId },
      });
    }, 150);
  }, [activeFile, currentUserId]);

  const handleApplyCodeToWorkspace = useCallback((code: string, fileName?: string) => {
    const target = fileName || activeFile;
    if (!target) {
      handleFileCreate({ name: "main.js", content: code, language: "javascript" });
      addToast("Created main.js with AI code!", "success");
      return;
    }
    const exists = files.some((f) => normalizePath(f.path || f.name) === normalizePath(target));
    if (!exists) {
      handleFileCreate({ name: target, content: code, language: getLangFromPath(target) });
      addToast(`Created ${target} with AI code!`, "success");
      return;
    }
    setFiles((prev) =>
      prev.map((f) => normalizePath(f.path || f.name) === normalizePath(target) ? { ...f, content: code } : f)
    );
    setModifiedFiles((prev) => new Set(prev).add(target));
    setActiveFile(target);
    if (!openTabs.includes(target)) setOpenTabs((prev) => [...prev, target]);
    addToast(`Applied AI code to ${target}!`, "success");
  }, [activeFile, files, handleFileCreate, openTabs, addToast]);

  const handleTabClose = useCallback((name: string) => {
    const next = openTabs.filter((t) => t !== name);
    setOpenTabs(next);
    if (activeFile === name) setActiveFile(next[next.length - 1] || files.find(f => !f.isFolder)?.name || "");
  }, [openTabs, activeFile, files]);

  // ── Language change ──
  async function handleLanguageChange(nextLang: string) {
    setLanguage(nextLang);
    await supabase.from("rooms").update({ language: nextLang }).eq("id", roomId);
    await roomChannelRef.current?.send({ type: "broadcast", event: "language-change", payload: { language: nextLang, userId: currentUserId } });
  }

  const handleSessionEnd = useCallback(async () => {
    if (room?.created_by && room.created_by !== currentUserId) return;
    await supabase.from("rooms").update({ is_active: false }).eq("id", roomId);
    setRoom((prev) => prev ? { ...prev, is_active: false } : prev);
    await roomChannelRef.current?.send({ type: "broadcast", event: "session-ended", payload: { userId: currentUserId } });
    addToast("Session ended. New joins are blocked; owner can still access this workspace.", "success");
  }, [room?.created_by, currentUserId, roomId, addToast]);

  // ── Media ──
  const handleMicToggle = useCallback(async (val?: boolean) => {
    if (val !== undefined) {
      setMicOn(val);
      return;
    }
    // If we're enabling mic outside a call, verify permission first
    const willEnable = !micOn;
    if (willEnable && !isCallJoined) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        stream.getTracks().forEach(track => track.stop());
      } catch {
        addToast("Microphone permission blocked. Allow mic access in the browser address bar.", "error");
        return; // Don't toggle if permission denied
      }
    }
    setMicOn(willEnable);
  }, [micOn, isCallJoined, addToast]);

  const handleCameraToggle = useCallback(async (val?: boolean) => {
    if (val !== undefined) {
      setCameraOn(val);
      return;
    }
    // If we're enabling camera outside a call, verify permission first
    const willEnable = !cameraOn;
    if (willEnable && !isCallJoined) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        stream.getTracks().forEach(track => track.stop());
      } catch {
        addToast("Camera permission blocked. Allow camera access in the browser address bar.", "error");
        return; // Don't toggle if permission denied
      }
    }
    setCameraOn(willEnable);
  }, [cameraOn, isCallJoined, addToast]);


  // ── Run code ──
  const [triggerRun, setTriggerRun] = useState(0);
  function handleRunCode() {
    setTerminalOpen(true);
    setTriggerRun((p) => p + 1);
  }

  // ── Breakpoints ──
  const handleBreakpointToggle = useCallback((file: string, line: number) => {
    setBreakpoints((prev) => {
      const exists = prev.find((bp) => bp.file === file && bp.line === line);
      return exists ? prev.filter((bp) => !(bp.file === file && bp.line === line)) : [...prev, { file, line }];
    });
  }, []);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      
      // Ctrl + S (Save)
      if (mod && e.key === "s") { 
        e.preventDefault(); 
        saveRef.current?.(); 
        addToast(directoryHandleRef.current ? "Project saved to your PC" : "Workspace saved to cloud", "success");
        setModifiedFiles(prev => { const n = new Set(prev); n.delete(activeFile); return n; }); 
      }
      
      // Ctrl + N (New File)
      if (mod && e.key === "n") {
        e.preventDefault();
        const name = `Untitled-${Math.floor(Math.random()*1000)}.js`;
        handleFileCreate({ name, content: "", language: "javascript" });
      }

      // Ctrl + W (Close Tab)
      if (mod && e.key === "w") {
        e.preventDefault();
        if (activeFile) handleTabClose(activeFile);
      }

      // Ctrl + B (Toggle Sidebar)
      if (mod && e.key === "b") { 
        e.preventDefault(); 
        setActivePanel((p) => (p === "none" ? "files" : "none")); 
      }

      // Ctrl + ` (Toggle Terminal)
      if (mod && e.key === "`") { 
        e.preventDefault(); 
        setTerminalOpen((p) => !p); 
      }
      
      if (e.key === "Escape") { 
        if (activePanel !== "none") setActivePanel("none"); 
        else if (terminalOpen) setTerminalOpen(false); 
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activePanel, terminalOpen, addToast, activeFile, handleFileCreate, handleTabClose]);

  // Chat
  const handleNewChatMessage = useCallback(() => { if (activePanel !== "chat") setUnreadChat((p) => p + 1); }, [activePanel]);
  useEffect(() => { if (activePanel === "chat") setUnreadChat(0); }, [activePanel]);

  const handleCursorChange = useCallback((line: number, col: number) => {
    setCursorLine(line);
    setCursorCol(col);
    if (cursorSendTimer.current) clearTimeout(cursorSendTimer.current);
    cursorSendTimer.current = setTimeout(() => {
      roomChannelRef.current?.send({
        type: "broadcast",
        event: "cursor-position",
        payload: {
          userId: currentUserId,
          name: currentUserName,
          file: activeFile,
          line,
          col,
          color: "#22d3ee",
        },
      });
    }, 80);
  }, [activeFile, currentUserId, currentUserName]);
  const handleSyncStatus = useCallback((status: "synced" | "syncing" | "saved") => { setSyncStatus(status); }, []);

  const selectedPreviewFile = previewTarget || activeFile;
  const previewSrcDoc = useMemo(() => buildPreviewSrcDoc(files, selectedPreviewFile), [files, selectedPreviewFile]);
  const previewPath = useMemo(() => {
    const htmlFile = getPreviewHtmlFile(files, selectedPreviewFile);
    return htmlFile?.path || htmlFile?.name || "";
  }, [files, selectedPreviewFile]);
  const activeFileItem = useMemo(() => files.find((f) => normalizePath(f.path || f.name) === selectedPreviewFile), [files, selectedPreviewFile]);

  const handlePreviewOpen = useCallback(() => {
    setPreviewFullscreen(false);
    setPreviewOpen(true);
  }, []);

  const handlePreviewClose = useCallback(() => {
    setPreviewOpen(false);
    setPreviewFullscreen(false);
  }, []);

  const togglePreviewFullscreen = useCallback(() => {
    setPreviewFullscreen((prev) => !prev);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const cutoff = Date.now() - 15000;
      setRemoteCursors((prev) => {
        const next = Object.fromEntries(Object.entries(prev).filter(([, cursor]) => cursor.updatedAt > cutoff));
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // Current file data
  const currentFile = files.find((f) => normalizePath(f.path || f.name) === activeFile && !f.isFolder);
  const currentCode = currentFile?.content || "";
  const currentLang = currentFile?.language || language;
  const visibleRemoteCursors = Object.values(remoteCursors);

  if (loading) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#1e1e1e", color: "#858585" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 40, height: 40, border: "3px solid #333", borderTopColor: "#007acc", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
          <p style={{ fontSize: 14 }}>Loading room…</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#1e1e1e" }}>
        <div style={{ color: "#f44747", fontSize: 14 }}>Room not found.</div>
      </div>
    );
  }

  return (
    <div className="room-layout" style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--vscode-bg)", overflow: "hidden" }}>
      <RoomTopbar
        roomId={room.id} roomCode={room.room_code} roomName={roomName} onRoomNameChange={setRoomName}
        language={language} onLanguageChange={handleLanguageChange} participants={members}
        micOn={micOn} cameraOn={cameraOn} screenOn={screenOn}
        onMicToggle={handleMicToggle} onCameraToggle={handleCameraToggle} 
        onScreenToggle={handleScreenToggle}
        onRunCode={handleRunCode} onPreview={handlePreviewOpen} onAddToast={addToast}
        onPublishClick={() => setPublishOpen(true)}
      />

      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0, position: "relative" }}>
        <ActivityBar 
          activePanel={activePanel} 
          onPanelChange={setActivePanel} 
          unreadChat={unreadChat} 
          participantCount={members.length}
          userAvatar={userAvatar}
          userName={currentUserName}
          onProfileClick={() => window.open('/dashboard?tab=account', '_blank')}
          onScreenShareClick={handleScreenToggle}
        />

        <LeftSidebar
          activePanel={activePanel} onPanelChange={setActivePanel} members={members} roomId={room.id}
          currentUserId={currentUserId} currentUserName={currentUserName}
          language={language} onLanguageChange={handleLanguageChange}
          roomName={roomName} onRoomNameChange={setRoomName} onNewChatMessage={handleNewChatMessage}
          files={files} activeFile={activeFile} openFileNames={openTabs} expandedFolders={Array.from(expandedFolders)} onFolderToggle={handleFolderToggle} onFileSelect={handleFileSelect}
          onFileCreate={handleFileCreate} onFileDelete={handleFileDelete} onFileRename={handleFileRename}
          onOpenProject={handleOpenProject} onSaveProject={handleSaveProject} projectName={projectName}
          breakpoints={breakpoints} onClearBreakpoints={() => setBreakpoints([])}
          currentCode={currentCode} isTeacher={room.created_by === currentUserId} hostUserId={room.created_by || undefined} onSaveWork={() => saveRef.current?.()}
          onSessionEnd={handleSessionEnd}
          onRemoveBreakpoint={(f, l) => setBreakpoints((prev) => prev.filter((bp) => !(bp.file === f && bp.line === l)))}
          micOn={micOn} cameraOn={cameraOn} screenOn={screenOn}
          isFullscreen={isFullscreen} onFullscreenChange={setIsFullscreen}
          onMicToggle={handleMicToggle} onCameraToggle={handleCameraToggle} onScreenToggle={handleScreenToggle}
          onAddToast={addToast}
          isCallJoined={isCallJoined} onCallJoinedChange={setIsCallJoined}
          onApplyCode={handleApplyCodeToWorkspace}
        />

        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, position: "relative", overflow: "hidden" }}>
          {/* Editor Tabs */}
          <EditorTabs
            tabs={openTabs.map((name) => ({ name, modified: modifiedFiles.has(name) }))}
            activeTab={activeFile}
            onTabSelect={handleFileSelect}
            onTabClose={handleTabClose}
          />

          {/* Breadcrumb */}
          <BreadcrumbBar activeFile={activeFile} />

          {/* Editor */}
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
            <Editor
              roomId={room.id} language={currentLang} code={currentCode} onCodeChange={handleCodeChange}
              currentUserId={currentUserId} wordWrap={wordWrap}
              onCursorChange={handleCursorChange} onSyncStatusChange={handleSyncStatus}
              codeRef={codeRef} saveRef={saveRef} activeFileName={activeFile}
              breakpoints={breakpoints} onBreakpointToggle={handleBreakpointToggle}
              remoteCursors={visibleRemoteCursors}
            />
          </div>

          {/* Terminal Panel */}
          {terminalOpen && (
            <div style={{ position: "relative", zIndex: 5, flexShrink: 0 }}>
              <TerminalPanel
                onClose={() => setTerminalOpen(false)}
                roomId={room.id} codeRef={codeRef}
                language={currentLang} activeFileName={activeFile}
                triggerRun={triggerRun}
                files={files}
                onFilesSync={handleTerminalFilesSync}
                onPreviewUrlChange={setProjectPreviewUrl}
                onOutputLog={(chunk) => setTerminalLogs((prev) => [...prev.slice(-120), chunk])}
              />
            </div>
          )}

          {previewOpen && (
            <div style={{
              position: previewFullscreen ? "fixed" : "absolute",
              inset: previewFullscreen ? 0 : "24px",
              zIndex: 9999,
              background: "#ffffff",
              display: "flex",
              flexDirection: "column",
              borderRadius: previewFullscreen ? 0 : 16,
              boxShadow: previewFullscreen ? "none" : "0 32px 80px rgba(0,0,0,0.55)",
              overflow: "hidden",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "#1a1a2e", borderBottom: "1px solid #2a2a38" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Eye size={14} color="#7C3AED" />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>
                      {projectPreviewUrl ? "Live Project Web Server" : previewMode === "project" ? "Full Project Preview" : previewMode === "folder" ? "Folder Preview" : "File Preview"}
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>
                      {projectPreviewUrl || previewTarget || previewPath || activeFile || "No file selected"}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {/* Preview Mode Selector */}
                  <select
                    value={previewMode}
                    onChange={(e) => {
                      setPreviewMode(e.target.value as "file" | "folder" | "project");
                      setPreviewTarget("");
                    }}
                    style={{ padding: "4px 8px", background: "#252b38", border: "1px solid #383f4d", borderRadius: 6, color: "#e2e8f0", fontSize: 11, cursor: "pointer" }}
                  >
                    <option value="file">📄 Current File</option>
                    <option value="folder">📁 Select Folder</option>
                    <option value="project">🌐 Full Project</option>
                  </select>
                  
                  {/* File/Folder Selector */}
                  {previewMode === "file" && (
                    <select
                      value={previewTarget || activeFile || ""}
                      onChange={(e) => setPreviewTarget(e.target.value)}
                      style={{ padding: "4px 8px", background: "#252b38", border: "1px solid #383f4d", borderRadius: 6, color: "#e2e8f0", fontSize: 11, cursor: "pointer", maxWidth: 150 }}
                    >
                      {files.filter(f => !f.isFolder).map(f => (
                        <option key={f.path || f.name} value={f.path || f.name}>{f.path || f.name}</option>
                      ))}
                    </select>
                  )}
                  {previewMode === "folder" && (
                    <select
                      value={previewTarget}
                      onChange={(e) => setPreviewTarget(e.target.value)}
                      style={{ padding: "4px 8px", background: "#252b38", border: "1px solid #383f4d", borderRadius: 6, color: "#e2e8f0", fontSize: 11, cursor: "pointer", maxWidth: 150 }}
                    >
                      <option value="">Select a folder...</option>
                      {files.filter(f => f.isFolder).map(f => (
                        <option key={f.name} value={f.name}>{f.name}</option>
                      ))}
                    </select>
                  )}
                  
                  <button onClick={() => { setTerminalOpen(true); setTriggerRun(Date.now()); }} style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", background: "#7C3AED22", border: "1px solid #7C3AED55", borderRadius: 6, color: "#c4b5fd", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                    <Play size={11} /> Run Code
                  </button>
                  <button onClick={togglePreviewFullscreen} style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", background: "#252b38", border: "1px solid #383f4d", borderRadius: 6, color: "#e2e8f0", cursor: "pointer", fontSize: 11 }}>
                    {previewFullscreen ? "Exit Full Screen" : "Full Screen"}
                  </button>
                  <button onClick={handlePreviewClose} style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", background: "#ef4444", border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                    Close
                  </button>
                </div>
              </div>

              <div style={{ flex: 1, position: "relative", background: "#ffffff", display: "flex", flexDirection: "column" }}>
                {projectPreviewUrl ? (
                  <iframe
                    src={projectPreviewUrl}
                    title="Project Preview"
                    style={{ width: "100%", height: "100%", border: "none", background: "#ffffff" }}
                  />
                ) : previewMode === "project" ? (
                  <iframe
                    sandbox="allow-scripts allow-same-origin"
                    srcDoc={buildProjectPreview(files)}
                    title="Full Project Preview"
                    style={{ width: "100%", height: "100%", border: "none", background: "#ffffff" }}
                  />
                ) : previewMode === "folder" && previewTarget ? (
                  <iframe
                    sandbox="allow-scripts allow-same-origin"
                    srcDoc={buildFolderPreview(files, previewTarget)}
                    title="Folder Preview"
                    style={{ width: "100%", height: "100%", border: "none", background: "#ffffff" }}
                  />
                ) : previewSrcDoc ? (
                  <iframe
                    sandbox="allow-scripts allow-same-origin"
                    srcDoc={previewSrcDoc}
                    title="CodeTogether Website Preview"
                    style={{ width: "100%", height: "100%", border: "none", background: "#ffffff" }}
                  />
                ) : (
                  <div style={{ flex: 1, padding: 24, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#13131c", border: "1px solid #222234", borderRadius: 12, padding: "12px 16px" }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>
                          📄 {activeFile || "Workspace File"} Output Preview
                        </div>
                        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                          Project Language: <strong style={{ color: "#c4b5fd" }}>{currentLang}</strong> · Interactive Console & Terminal Output
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => setTerminalLogs([])} style={{ padding: "4px 10px", background: "#1e1e2d", border: "1px solid #33334d", borderRadius: 6, color: "#aaa", fontSize: 11, cursor: "pointer" }}>
                          Clear Output
                        </button>
                        <button onClick={() => { setTerminalOpen(true); setTriggerRun(Date.now()); }} style={{ padding: "4px 12px", background: "linear-gradient(135deg,#7C3AED,#5b21b6)", border: "none", borderRadius: 6, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                          ▶ Execute Project
                        </button>
                      </div>
                    </div>

                    {/* Output Content */}
                    {activeFile?.endsWith(".md") ? (
                      <div style={{ background: "#0d0d14", border: "1px solid #1a1a2e", borderRadius: 12, padding: 20, color: "#e2e8f0", fontSize: 13, lineHeight: 1.7, fontFamily: "Inter, sans-serif" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#7C3AED", textTransform: "uppercase", marginBottom: 12, letterSpacing: "0.08em" }}>
                          Markdown Document Preview
                        </div>
                        <div dangerouslySetInnerHTML={{
                          __html: (activeFileItem?.content || "")
                            .replace(/^# (.*$)/gim, '<h1 style="font-size:22px;color:#fff;margin:12px 0 6px">$1</h1>')
                            .replace(/^## (.*$)/gim, '<h2 style="font-size:18px;color:#c4b5fd;margin:10px 0 4px">$1</h2>')
                            .replace(/^### (.*$)/gim, '<h3 style="font-size:15px;color:#e2e8f0;margin:8px 0 4px">$1</h3>')
                            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                            .replace(/`([^`]+)`/g, '<code style="background:#1a1a2e;padding:2px 6px;border-radius:4px;color:#c4b5fd">$1</code>')
                            .replace(/\n/g, '<br/>')
                        }} />
                      </div>
                    ) : terminalLogs.length > 0 ? (
                      <div style={{ flex: 1, background: "#06060c", border: "1px solid #1e1e2e", borderRadius: 12, padding: 16, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, lineHeight: 1.6, color: "#e2e8f0", overflowY: "auto", maxHeight: "60vh" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#34d399", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#34d399" }} /> Live Console & Terminal Output Log
                        </div>
                        <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                          {terminalLogs.join("")}
                        </pre>
                      </div>
                    ) : (
                      <div style={{ background: "#0d0d14", border: "1px dashed #2a2a3c", borderRadius: 12, padding: 32, textAlign: "center", color: "#94a3b8" }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
                          ⚡ Ready to Run Output Preview
                        </div>
                        <p style={{ fontSize: 13, color: "#888", maxWidth: 500, margin: "0 auto 16px" }}>
                          This project will display its live execution output here. Run your script or project from the terminal, or click the button below to start.
                        </p>
                        <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
                          <button onClick={() => { setTerminalOpen(true); setTriggerRun(Date.now()); }} style={{ padding: "8px 18px", background: "linear-gradient(135deg,#7C3AED,#5b21b6)", border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                            ▶ Execute {activeFile || "Project"} Now
                          </button>
                          <button onClick={() => setTerminalOpen(true)} style={{ padding: "8px 16px", background: "#1a1a28", border: "1px solid #33334d", borderRadius: 8, color: "#ccc", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                            💻 Open Interactive Terminal
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <StatusBar
        language={currentLang} cursorLine={cursorLine} cursorColumn={cursorCol}
        syncStatus={syncStatus} participantCount={members.length}
        wordWrap={wordWrap} onWordWrapToggle={() => setWordWrap((p) => !p)} tabSize={2}
      />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Publish to Library Modal */}
      {publishOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 99999 }}>
          <div style={{ background: "#1e1e1e", border: "1px solid #333", borderRadius: 16, padding: 24, width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 16, boxShadow: "0 24px 64px rgba(0,0,0,0.8)", fontFamily: "Inter, sans-serif" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #2d2d2d", paddingBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", gap: 6 }}>
                📚 Publish to Library
              </h3>
              <button onClick={() => setPublishOpen(false)} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 18 }}>✕</button>
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 10, color: "#888", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 5 }}>Project Title</label>
                <input
                  value={pubTitle}
                  onChange={(e) => setPubTitle(e.target.value)}
                  placeholder="e.g. Next.js Starter Kit"
                  style={{ width: "100%", background: "#111", border: "1px solid #333", borderRadius: 8, color: "#fff", fontSize: 13, padding: "8px 12px", outline: "none", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ fontSize: 10, color: "#888", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 5 }}>Author Name</label>
                <input
                  value={pubAuthor}
                  onChange={(e) => setPubAuthor(e.target.value)}
                  placeholder="e.g. John Doe"
                  style={{ width: "100%", background: "#111", border: "1px solid #333", borderRadius: 8, color: "#fff", fontSize: 13, padding: "8px 12px", outline: "none", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ fontSize: 10, color: "#888", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Publish Destination</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <button
                    onClick={() => setPubVisibility("public")}
                    style={{ padding: "10px", border: pubVisibility === "public" ? "1px solid #10b981" : "1px solid #333", borderRadius: 8, background: pubVisibility === "public" ? "#10b98120" : "#111", color: pubVisibility === "public" ? "#34d399" : "#aaa", cursor: "pointer", fontWeight: 800, fontSize: 12 }}
                  >
                    Shared Library
                  </button>
                  <button
                    onClick={() => setPubVisibility("private")}
                    style={{ padding: "10px", border: pubVisibility === "private" ? "1px solid #f43f5e" : "1px solid #333", borderRadius: 8, background: pubVisibility === "private" ? "#f43f5e20" : "#111", color: pubVisibility === "private" ? "#f87171" : "#aaa", cursor: "pointer", fontWeight: 800, fontSize: 12 }}
                  >
                    Private Library
                  </button>
                </div>
              </div>

              {pubVisibility === "private" && (
                <div>
                  <label style={{ fontSize: 10, color: "#f87171", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 5 }}>Private Access Code</label>
                  <input
                    value={pubAccessCode}
                    onChange={(e) => setPubAccessCode(e.target.value)}
                    placeholder="Required for non-followers"
                    style={{ width: "100%", background: "#111", border: "1px solid #f43f5e55", borderRadius: 8, color: "#fff", fontSize: 13, padding: "8px 12px", outline: "none", boxSizing: "border-box" }}
                  />
                  <p style={{ color: "#777", fontSize: 11, margin: "6px 0 0" }}>Followers can access private library items from your profile; others need this passcode.</p>
                </div>
              )}

              <div>
                <label style={{ fontSize: 10, color: "#888", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 5 }}>Category</label>
                <select
                  value={pubCat}
                  onChange={(e) => setPubCat(e.target.value)}
                  style={{ width: "100%", background: "#111", border: "1px solid #333", borderRadius: 8, color: "#ccc", fontSize: 13, padding: "8px 12px", outline: "none", cursor: "pointer" }}
                >
                  {["Tutorials", "Algorithms", "Templates", "Web Pages", "Others"].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 10, color: "#888", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 5 }}>Description</label>
                <textarea
                  value={pubDesc}
                  onChange={(e) => setPubDesc(e.target.value)}
                  placeholder="Describe what this project does..."
                  rows={3}
                  style={{ width: "100%", background: "#111", border: "1px solid #333", borderRadius: 8, color: "#fff", fontSize: 13, padding: "8px 12px", outline: "none", boxSizing: "border-box", resize: "none" }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              <button
                onClick={() => setPublishOpen(false)}
                style={{ flex: 1, padding: "10px", border: "1px solid #333", borderRadius: 8, background: "transparent", color: "#ccc", cursor: "pointer", fontWeight: 600, fontSize: 13 }}
              >
                Cancel
              </button>
              <button
                onClick={handlePublishToLibrary}
                disabled={publishing}
                style={{ flex: 1, padding: "10px", border: "none", borderRadius: 8, background: publishing ? "#333" : "linear-gradient(135deg,#7C3AED,#5b21b6)", color: "#fff", cursor: publishing ? "default" : "pointer", fontWeight: 800, fontSize: 13 }}
              >
                {publishing ? "Publishing..." : "Publish Now"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Nickname Prompt Modal ── */}
      {nicknameModalOpen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 999999, background: "rgba(0,0,0,0.85)",
          backdropFilter: "blur(12px)", display: "grid", placeItems: "center", padding: 20
        }}>
          <div style={{
            width: "100%", maxWidth: 400, background: "#121218", border: "1px solid rgba(124, 58, 237, 0.45)",
            borderRadius: 18, padding: 24, boxShadow: "0 20px 50px rgba(0,0,0,0.9), 0 0 30px rgba(124,58,237,0.3)",
            animation: "pcp-fadeIn 0.25s ease-out"
          }}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ width: 52, height: 52, borderRadius: "50%", background: "linear-gradient(135deg,#7C3AED,#5b21b6)", display: "grid", placeItems: "center", margin: "0 auto 12px", color: "#fff", fontSize: 24, fontWeight: 800, boxShadow: "0 0 20px rgba(124,58,237,0.5)" }}>
                {tempNickname.trim() ? tempNickname.trim().charAt(0).toUpperCase() : "👋"}
              </div>
              <h2 style={{ margin: 0, fontSize: 20, color: "#fff", fontWeight: 800, letterSpacing: "-0.01em" }}>Enter Your Nickname</h2>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: "#94a3b8", lineHeight: 1.4 }}>
                Choose a nickname to display to other users in this room, chat, and call.
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const nameToUse = tempNickname.trim() || "Guest";
                setCurrentUserName(nameToUse);
                if (typeof window !== "undefined") {
                  sessionStorage.setItem(`codetogether_nickname_${roomId}`, nameToUse);
                }
                setNicknameModalOpen(false);
                if (roomChannelRef.current) {
                  void roomChannelRef.current.track({ userId: currentUserId, name: nameToUse, avatar: userAvatar });
                }
              }}
              style={{ display: "flex", flexDirection: "column", gap: 14 }}
            >
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#c4b5fd", textTransform: "uppercase", marginBottom: 6 }}>NICKNAME / ALIAS</label>
                <input
                  autoFocus
                  value={tempNickname}
                  onChange={(e) => setTempNickname(e.target.value)}
                  placeholder="e.g. Alex, CodeGuru, Ramji"
                  style={{ width: "100%", background: "#1a1a24", border: "1px solid #7C3AED66", borderRadius: 8, color: "#fff", fontSize: 14, padding: "10px 12px", outline: "none", boxSizing: "border-box" }}
                />
              </div>

              <button
                type="submit"
                style={{ width: "100%", padding: 12, border: "none", borderRadius: 8, background: "linear-gradient(135deg,#7C3AED,#5b21b6)", color: "#fff", cursor: "pointer", fontWeight: 800, fontSize: 14, boxShadow: "0 4px 16px rgba(124,58,237,0.4)" }}
              >
                Join Room as &ldquo;{tempNickname.trim() || "Guest"}&rdquo;
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
