import { NextRequest, NextResponse } from "next/server";
import { terminalManager } from "@/lib/terminal-manager";
import { getAuthenticatedUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { basename, dirname, join, resolve, sep } from "path";
import { Dirent, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "fs";
import { execFileSync } from "child_process";

type WorkspaceFile = {
  name: string;
  path?: string;
  content?: string;
  language?: string;
  isFolder?: boolean;
};

const MAX_SYNC_FILE_SIZE = 512 * 1024;
const TERMINAL_LIMIT = { max: 20, windowMs: 60_000 };
const IGNORE_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage", ".turbo", ".cache"]);
const IGNORE_FILES = new Set(["package-lock.json", "yarn.lock", "pnpm-lock.yaml"]);

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

function quoteShell(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function findJavaMainClass(dir: string, fallbackClass: string) {
  try {
    const mainFile = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".java"))
      .map((entry) => join(dir, entry.name))
      .find((file) => /public\s+static\s+void\s+main\s*\(\s*String\s*\[\]\s+\w+\s*\)/.test(readFileSync(file, "utf8")));

    if (!mainFile) return fallbackClass;
    const source = readFileSync(mainFile, "utf8");
    const classMatch = source.match(/public\s+class\s+([A-Za-z0-9_$]+)/) || source.match(/\bclass\s+([A-Za-z0-9_$]+)/);
    return classMatch ? classMatch[1] : basename(mainFile, ".java");
  } catch {
    return fallbackClass;
  }
}

function hasExecutable(command: string) {
  try {
    execFileSync(command, ["--version"], { stdio: "ignore", timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

function getRunnableFile(language: string, code: string, preferredFileName?: string, runDir?: string) {
  const normalized = language.toLowerCase();
  if (normalized === "java") {
    const classMatch = code.match(/public\s+class\s+([A-Za-z0-9_$]+)/);
    const className = classMatch ? classMatch[1] : "Main";
    const fileName = preferredFileName || `${className}.java`;
    const mainClass = runDir ? findJavaMainClass(runDir, className) : className;
    return { fileName, execCmd: `javac -encoding UTF-8 *.java && java ${quoteShell(mainClass)}` };
  }

  const name = preferredFileName || "";
  const fallback: Record<string, string> = {
    javascript: "main.js", typescript: "main.ts", python: "main.py", cpp: "main.cpp",
    c: "main.c", csharp: "Main.cs", go: "main.go", rust: "main.rs", php: "main.php",
    ruby: "main.rb", kotlin: "Main.kt", swift: "main.swift", scala: "Main.scala",
    perl: "main.pl", r: "main.r", lua: "main.lua", dart: "main.dart",
    shell: "main.sh", bash: "main.sh", html: "index.html", css: "style.css",
    json: "main.json", markdown: "README.md",
  };
  const fileName = name || fallback[normalized] || "main.js";
  const q = quoteShell(fileName);
  const runners: Record<string, string> = {
    javascript: `node ${q}`,
    typescript: hasExecutable("tsx") ? `tsx ${q}` : `node ${q}`,
    python: `python3 ${q}`,
    cpp: `g++ ${q} -o main && ./main`,
    c: `gcc ${q} -o main && ./main`,
    csharp: `dotnet-script ${q}`,
    go: `go run ${q}`,
    rust: `rustc ${q} -o main && ./main`,
    php: `php ${q}`,
    ruby: `ruby ${q}`,
    kotlin: `kotlinc ${q} -include-runtime -d main.jar && java -jar main.jar`,
    swift: `swift ${q}`,
    scala: `scala ${q}`,
    perl: `perl ${q}`,
    r: `Rscript ${q}`,
    lua: `lua ${q}`,
    dart: `dart ${q}`,
    shell: `sh ${q}`,
    bash: `bash ${q}`,
    html: `printf 'HTML saved to ${fileName}. Use Preview or download/open it in a browser.\\n' && wc -c ${q}`,
    css: `printf 'CSS saved to ${fileName}. Attach it to an HTML file to preview styles.\\n' && wc -c ${q}`,
    json: `node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); console.log('Valid JSON')" ${q}`,
    markdown: `printf 'Markdown saved to ${fileName}.\\n' && wc -l ${q}`,
  };

  return { fileName, execCmd: runners[normalized] || runners.javascript };
}

function collectWorkspaceFiles(root: string) {
  const out: WorkspaceFile[] = [];

  function walk(dir: string, rel = "") {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".env") continue;
      const nextRel = rel ? `${rel}/${entry.name}` : entry.name;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(entry.name)) continue;
        out.push({ name: nextRel, path: nextRel, content: "", language: "folder", isFolder: true });
        walk(full, nextRel);
      } else if (entry.isFile()) {
        if (IGNORE_FILES.has(entry.name)) continue;
        try {
          const st = statSync(full);
          if (st.size > MAX_SYNC_FILE_SIZE) continue;
          const content = readFileSync(full, "utf8");
          out.push({ name: nextRel, path: nextRel, content, language: getLangFromPath(nextRel) });
        } catch {}
      }
    }
  }

  walk(root);
  return out;
}

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const { action, sessionId, command, args, data, code, language, cwd = "", files = [], activeFileName = "", rawInput = false } = await req.json();

    if (action === "start") {
      const limit = checkRateLimit(`terminal:${user.id}`, TERMINAL_LIMIT.max, TERMINAL_LIMIT.windowMs);
      if (!limit.allowed) {
        return NextResponse.json({ error: `Rate limit exceeded. Try again in ${limit.retryAfter}s.` }, { status: 429 });
      }

      const runId = sessionId || `session_${Date.now()}`;
      const workspaceRoot = join(process.cwd(), "temp_workspaces", runId);
      try { mkdirSync(workspaceRoot, { recursive: true }); } catch {}

      for (const file of files as WorkspaceFile[]) {
        const relPath = String(file.path || file.name || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
        if (!relPath || relPath.includes("..")) continue;
        const target = resolve(workspaceRoot, relPath);
        if (!target.startsWith(workspaceRoot + sep) && target !== workspaceRoot) continue;
        if (file.isFolder) {
          mkdirSync(target, { recursive: true });
        } else {
          mkdirSync(dirname(target), { recursive: true });
          writeFileSync(target, file.content || "", "utf8");
        }
      }

      const requestedCwd = String(cwd || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
      const activeRelPath = String(activeFileName || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
      const activeRunDir = activeRelPath && !activeRelPath.includes("..") ? dirname(activeRelPath) : "";
      const executionRelDir = typeof code === "string" && language && activeRunDir !== "." ? activeRunDir : requestedCwd;
      const tmpDir = resolve(workspaceRoot, executionRelDir || ".");
      if (!tmpDir.startsWith(workspaceRoot + sep) && tmpDir !== workspaceRoot) {
        return NextResponse.json({ error: "Invalid terminal working directory." }, { status: 400 });
      }
      mkdirSync(tmpDir, { recursive: true });

      let execCmd = command;
      const execArgs = args || [];

      if (typeof code === "string" && language) {
        const preferredFileName = activeRelPath && !activeRelPath.includes("..") ? basename(activeRelPath) : undefined;
        let runnable = getRunnableFile(language, code, preferredFileName);
        const fileName = runnable.fileName;
        writeFileSync(join(tmpDir, fileName), code, "utf8");
        runnable = getRunnableFile(language, code, preferredFileName, tmpDir);
        execCmd = runnable.execCmd;
      }

      if (!execCmd || typeof execCmd !== "string") {
        return NextResponse.json({ error: "No command or runnable code was provided." }, { status: 400 });
      }

      terminalManager.startSession(runId, execCmd, execArgs, tmpDir, workspaceRoot);
      return NextResponse.json({ sessionId: runId });
    }

    if (action === "input") {
      terminalManager.writeToStdin(sessionId, rawInput ? data : data + "\n");
      return NextResponse.json({ success: true });
    }

    if (action === "output") {
      const session = terminalManager.readSession(sessionId);
      let syncedFiles: WorkspaceFile[] | undefined;
      if (session && !session.running && !session.synced && session.syncRoot) {
        syncedFiles = collectWorkspaceFiles(session.syncRoot);
        terminalManager.markSynced(sessionId);
      }
      return NextResponse.json(session ? { ...session, files: syncedFiles } : { output: [], running: false, exitCode: null, error: null });
    }

    if (action === "stop") {
      terminalManager.stopSession(sessionId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const status = errMsg.includes("capacity") ? 429 : 500;
    return NextResponse.json({ error: errMsg }, { status });
  }
}
