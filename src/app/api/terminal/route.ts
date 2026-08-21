import { NextRequest, NextResponse } from "next/server";
import { terminalManager } from "@/lib/terminal-manager";
import { resolveCodeLanguage, executeWithPiston } from "@/lib/piston";
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
    return { fileName, execCmd: `javac -encoding UTF-8 *.java && java ${quoteShell(mainClass)}`, pistonFallback: !hasExecutable("javac") };
  }

  const name = preferredFileName || "";
  const fallback: Record<string, string> = {
    javascript: "main.js", typescript: "main.ts", python: "main.py", cpp: "main.cpp",
    c: "main.c", csharp: "Main.cs", go: "main.go", rust: "main.rs", php: "main.php",
    ruby: "main.rb", kotlin: "Main.kt", swift: "main.swift", scala: "Main.scala",
    perl: "main.pl", r: "main.r", lua: "main.lua", dart: "main.dart",
    shell: "main.sh", bash: "main.sh", html: "index.html", css: "style.css",
    json: "main.json", markdown: "README.md", haskell: "main.hs", elixir: "main.ex",
    clojure: "main.clj", erlang: "main.erl", nim: "main.nim", pascal: "main.pas",
    fortran: "main.f90", ocaml: "main.ml", zig: "main.zig", d: "main.d",
    julia: "main.jl", lisp: "main.lisp", scheme: "main.scm", assembly: "main.asm",
    asm: "main.asm", nasm: "main.asm", prolog: "main.pl", cobol: "main.cob",
    crystal: "main.cr", elm: "main.elm", groovy: "Main.groovy", racket: "main.rkt",
    tcl: "main.tcl", fsharp: "Main.fs",
  };
  const fileName = name || fallback[normalized] || "main.js";
  const q = quoteShell(fileName);
  const runners: Record<string, { execCmd: string; bin?: string }> = {
    javascript: { execCmd: `node ${q}`, bin: "node" },
    typescript: hasExecutable("tsx") ? { execCmd: `tsx ${q}`, bin: "tsx" } : { execCmd: `node ${q}`, bin: "node" },
    python: { execCmd: `python3 ${q}`, bin: "python3" },
    cpp: { execCmd: `g++ ${q} -o main && ./main`, bin: "g++" },
    c: { execCmd: `gcc ${q} -o main && ./main`, bin: "gcc" },
    csharp: { execCmd: `dotnet-script ${q}`, bin: "dotnet-script" },
    go: { execCmd: `go run ${q}`, bin: "go" },
    rust: { execCmd: `rustc ${q} -o main && ./main`, bin: "rustc" },
    php: { execCmd: `php ${q}`, bin: "php" },
    ruby: { execCmd: `ruby ${q}`, bin: "ruby" },
    kotlin: { execCmd: `kotlinc ${q} -include-runtime -d main.jar && java -jar main.jar`, bin: "kotlinc" },
    swift: { execCmd: `swift ${q}`, bin: "swift" },
    scala: { execCmd: `scala ${q}`, bin: "scala" },
    perl: { execCmd: `perl ${q}`, bin: "perl" },
    r: { execCmd: `Rscript ${q}`, bin: "Rscript" },
    lua: { execCmd: `lua ${q}`, bin: "lua" },
    dart: { execCmd: `dart ${q}`, bin: "dart" },
    shell: { execCmd: `sh ${q}`, bin: "sh" },
    bash: { execCmd: `bash ${q}`, bin: "bash" },
    html: { execCmd: `printf 'HTML saved to ${fileName}. Use Preview or download/open it in a browser.\\n' && wc -c ${q}` },
    css: { execCmd: `printf 'CSS saved to ${fileName}. Attach it to an HTML file to preview styles.\\n' && wc -c ${q}` },
    json: { execCmd: `node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); console.log('Valid JSON')" ${q}`, bin: "node" },
    markdown: { execCmd: `printf 'Markdown saved to ${fileName}.\\n' && wc -l ${q}` },
    haskell: { execCmd: `runghc ${q}`, bin: "runghc" },
    elixir: { execCmd: `elixir ${q}`, bin: "elixir" },
    clojure: { execCmd: `clojure ${q}`, bin: "clojure" },
    erlang: { execCmd: `escript ${q}`, bin: "escript" },
    nim: { execCmd: `nim compile --run ${q}`, bin: "nim" },
    pascal: { execCmd: `fpc ${q} && ./main`, bin: "fpc" },
    fortran: { execCmd: `gfortran ${q} -o main && ./main`, bin: "gfortran" },
    ocaml: { execCmd: `ocaml ${q}`, bin: "ocaml" },
    zig: { execCmd: `zig run ${q}`, bin: "zig" },
    d: { execCmd: `dmd ${q} -of=main && ./main`, bin: "dmd" },
    julia: { execCmd: `julia ${q}`, bin: "julia" },
    lisp: { execCmd: `sbcl --script ${q}`, bin: "sbcl" },
    scheme: { execCmd: `guile ${q}`, bin: "guile" },
    assembly: { execCmd: `nasm -felf64 ${q} -o main.o && ld main.o -o main && ./main`, bin: "nasm" },
    asm: { execCmd: `nasm -felf64 ${q} -o main.o && ld main.o -o main && ./main`, bin: "nasm" },
    nasm: { execCmd: `nasm -felf64 ${q} -o main.o && ld main.o -o main && ./main`, bin: "nasm" },
    prolog: { execCmd: `swipl -q -f ${q}`, bin: "swipl" },
    cobol: { execCmd: `cobc -x ${q} -o main && ./main`, bin: "cobc" },
    crystal: { execCmd: `crystal run ${q}`, bin: "crystal" },
    elm: { execCmd: `elm make ${q}`, bin: "elm" },
    groovy: { execCmd: `groovy ${q}`, bin: "groovy" },
    racket: { execCmd: `racket ${q}`, bin: "racket" },
    tcl: { execCmd: `tclsh ${q}`, bin: "tclsh" },
    fsharp: { execCmd: `dotnet fsi ${q}`, bin: "dotnet" },
  };

  const runner = runners[normalized];
  if (!runner) {
    return { fileName, execCmd: "", pistonFallback: true };
  }
  return { fileName, execCmd: runner.execCmd, pistonFallback: !!runner.bin && !hasExecutable(runner.bin) };
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
    const { user } = await getAuthenticatedUser(req);
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
    const userId = user?.id || clientIp;

    const { action, sessionId, command, args, data, code, language, cwd = "", files = [], activeFileName = "", rawInput = false, signal } = await req.json();

    if (action === "start") {
      const limit = checkRateLimit(`terminal:${userId}`, TERMINAL_LIMIT.max, TERMINAL_LIMIT.windowMs);
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
      let targetFileName: string | undefined = undefined;
      let effectiveLang = language;

      if (typeof code === "string" && language) {
        const preferredFileName = activeRelPath && !activeRelPath.includes("..") ? basename(activeRelPath) : undefined;
        effectiveLang = resolveCodeLanguage(language, code, preferredFileName);
        let runnable = getRunnableFile(effectiveLang, code, preferredFileName);
        targetFileName = runnable.fileName;
        writeFileSync(join(tmpDir, targetFileName), code, "utf8");
        runnable = getRunnableFile(effectiveLang, code, preferredFileName, tmpDir);
        if (runnable.pistonFallback) {
          terminalManager.startPistonSession(runId, effectiveLang, code, tmpDir, workspaceRoot, targetFileName);
          return NextResponse.json({ sessionId: runId });
        }
        execCmd = runnable.execCmd;
      }

      if (!execCmd || typeof execCmd !== "string") {
        if (typeof code === "string" && language) {
          execCmd = code;
        } else {
          return NextResponse.json({ error: "No command or runnable code was provided." }, { status: 400 });
        }
      }

      const allowNetwork = true;

      try {
        terminalManager.startSession(runId, execCmd, execArgs, tmpDir, workspaceRoot, allowNetwork);
      } catch (err: any) {
        if (typeof code === "string" && language) {
          terminalManager.startPistonSession(runId, effectiveLang, code, tmpDir, workspaceRoot, targetFileName);
        } else {
          terminalManager.startPistonSession(runId, "bash", execCmd, tmpDir, workspaceRoot);
        }
      }
      return NextResponse.json({ sessionId: runId });
    }

    if (action === "input") {
      terminalManager.writeToStdin(sessionId, rawInput ? data : data + "\n");
      return NextResponse.json({ success: true });
    }

    if (action === "signal") {
      terminalManager.sendSignal(sessionId, (signal || "SIGINT") as NodeJS.Signals);
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

    if (action === "stop" || action === "kill") {
      terminalManager.stopSession(sessionId);
      return NextResponse.json({ success: true });
    }

    if (action === "run-command") {
      const limit = checkRateLimit(`terminal:${userId}`, TERMINAL_LIMIT.max, TERMINAL_LIMIT.windowMs);
      if (!limit.allowed) {
        return NextResponse.json({ error: `Rate limit exceeded. Try again in ${limit.retryAfter}s.` }, { status: 429 });
      }

      const cmd = String(command || "").trim();
      if (!cmd) {
        return NextResponse.json({ error: "No command provided." }, { status: 400 });
      }

      const result = await executeWithPiston("bash", cmd);
      const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
      return NextResponse.json({ output, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const status = errMsg.includes("capacity") ? 429 : 500;
    return NextResponse.json({ error: errMsg }, { status });
  }
}
