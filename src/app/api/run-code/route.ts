import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { executionQueue } from "@/lib/execution-queue";
import { getAuthenticatedUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { executeWithPiston } from "@/lib/piston";

const SANDBOX_IMAGE = "codetogether-sandbox:latest";
const RUN_CODE_LIMIT = { max: 12, windowMs: 60_000 };

function quoteShell(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function getRunnableFile(language: string, code: string) {
  const normalized = language.toLowerCase();
  if (normalized === "java") {
    const classMatch = code.match(/public\s+class\s+([A-Za-z0-9_$]+)/);
    const className = classMatch ? classMatch[1] : "Main";
    return { fileName: `${className}.java`, execCmd: `javac -encoding UTF-8 ${quoteShell(`${className}.java`)} && java ${quoteShell(className)}` };
  }

  const runners: Record<string, { fileName: string; execCmd: string }> = {
    javascript: { fileName: "main.js", execCmd: `node ${quoteShell("main.js")}` },
    typescript: { fileName: "main.ts", execCmd: `tsx ${quoteShell("main.ts")}` },
    python: { fileName: "main.py", execCmd: `python3 ${quoteShell("main.py")}` },
    cpp: { fileName: "main.cpp", execCmd: `g++ ${quoteShell("main.cpp")} -o main && ./main` },
    c: { fileName: "main.c", execCmd: `gcc ${quoteShell("main.c")} -o main && ./main` },
    csharp: { fileName: "Main.cs", execCmd: `dotnet-script ${quoteShell("Main.cs")}` },
    go: { fileName: "main.go", execCmd: `go run ${quoteShell("main.go")}` },
    rust: { fileName: "main.rs", execCmd: `rustc ${quoteShell("main.rs")} -o main && ./main` },
    php: { fileName: "main.php", execCmd: `php ${quoteShell("main.php")}` },
    ruby: { fileName: "main.rb", execCmd: `ruby ${quoteShell("main.rb")}` },
    kotlin: { fileName: "Main.kt", execCmd: `kotlinc ${quoteShell("Main.kt")} -include-runtime -d main.jar && java -jar main.jar` },
    swift: { fileName: "main.swift", execCmd: `swift ${quoteShell("main.swift")}` },
    scala: { fileName: "Main.scala", execCmd: `scala ${quoteShell("Main.scala")}` },
    perl: { fileName: "main.pl", execCmd: `perl ${quoteShell("main.pl")}` },
    r: { fileName: "main.r", execCmd: `Rscript ${quoteShell("main.r")}` },
    lua: { fileName: "main.lua", execCmd: `lua ${quoteShell("main.lua")}` },
    dart: { fileName: "main.dart", execCmd: `dart ${quoteShell("main.dart")}` },
    shell: { fileName: "main.sh", execCmd: `sh ${quoteShell("main.sh")}` },
    bash: { fileName: "main.sh", execCmd: `bash ${quoteShell("main.sh")}` },
    html: { fileName: "index.html", execCmd: `printf 'HTML saved to index.html. Use Preview or download/open it in a browser.\\n' && wc -c ${quoteShell("index.html")}` },
    css: { fileName: "style.css", execCmd: `printf 'CSS saved to style.css. Attach it to an HTML file to preview styles.\\n' && wc -c ${quoteShell("style.css")}` },
    json: { fileName: "main.json", execCmd: `node -e "JSON.parse(require('fs').readFileSync('main.json','utf8')); console.log('Valid JSON')"` },
    markdown: { fileName: "README.md", execCmd: `printf 'Markdown saved to README.md.\\n' && wc -l "README.md"` },
  };

  return runners[normalized] || runners.javascript;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let release: (() => void) | null = null;
  try {
    const { user } = await getAuthenticatedUser(req);
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
    const userId = user?.id || clientIp;

    const limit = checkRateLimit(`run-code:${userId}`, RUN_CODE_LIMIT.max, RUN_CODE_LIMIT.windowMs);
    if (!limit.allowed) {
      return NextResponse.json(
        { stdout: "", stderr: `Rate limit exceeded. Try again in ${limit.retryAfter}s.`, exitCode: 1 },
        { status: 429 },
      );
    }

    const { code, language, fileName: requestedFileName } = await req.json();
    console.log(`[RunCode] Lang: ${language}, Code: ${code?.slice(0, 50)}...`);

    if (!code || typeof code !== "string") {
      return NextResponse.json({ stdout: "", stderr: "No code provided", exitCode: 1 });
    }

    const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const tmpDir = join(process.cwd(), "temp_runs", runId);
    try { mkdirSync(tmpDir, { recursive: true }); } catch {}

    try {
      release = await executionQueue.acquireRun();
    } catch (err: any) {
      try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
      return NextResponse.json({ stdout: "", stderr: err.message, exitCode: 1 }, { status: 429 });
    }

    // Shell commands
    if (language === "shell" || language === "bash" || language === "sh") {
      const trimmed = code.trim();
      const containerName = `codetogether_shell_${runId}`;
      const dockerArgs = [
        "run", "--name", containerName, "--rm",
        "-e", "LANG=C.UTF-8", "-e", "LC_ALL=C.UTF-8",
        "-v", `${tmpDir}:/workspace`, "-w", "/workspace",
        "--memory=256m", "--cpus=0.5", "--pids-limit=100",
        SANDBOX_IMAGE, "sh", "-c", trimmed,
      ];

      return new Promise<NextResponse>((resolve) => {
        execFile("docker", dockerArgs, { timeout: 20000, maxBuffer: 1024 * 1024 }, async (err, stdout, stderr) => {
          try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
          if (err) {
            console.warn("[RunCode] Shell Docker execution failed, falling back to Piston:", err.message);
            const pistonRes = await executeWithPiston("bash", trimmed);
            if (release) release();
            resolve(NextResponse.json(pistonRes));
            return;
          }
          if (release) release();
          resolve(NextResponse.json({ 
            stdout: stdout || "", 
            stderr: stderr || "", 
            exitCode: 0 
          }));
        });
      });
    }

    // Language specific execution
    const runnable = getRunnableFile(language || "javascript", code);
    // Strip directory paths from requested filename (e.g. "src/main.js" -> "main.js")
    const cleanRequestedName = requestedFileName ? String(requestedFileName).replace(/\\/g, "/").split("/").pop() || requestedFileName : undefined;
    const fileName = cleanRequestedName || runnable.fileName;
    const execCmd = cleanRequestedName ? (runnable.execCmd.replace(runnable.fileName, quoteShell(fileName)) || `node ${quoteShell(fileName)}`) : runnable.execCmd;

    const tmpFile = join(tmpDir, fileName);
    writeFileSync(tmpFile, code, "utf-8");

    const containerName = `codetogether_run_${runId}`;
    const dockerArgs = [
      "run", "--name", containerName, "--rm",
      "-e", "LANG=C.UTF-8", "-e", "LC_ALL=C.UTF-8",
      "-v", `${tmpDir}:/workspace`, "-w", "/workspace",
      "--memory=256m", "--cpus=0.5", "--pids-limit=100",
      SANDBOX_IMAGE, "sh", "-c", execCmd,
    ];

    console.log(`[RunCode] Executing in Docker: docker ${dockerArgs.join(" ")}`);

    return new Promise<NextResponse>((resolve) => {
      execFile("docker", dockerArgs, { timeout: 20000, maxBuffer: 1024 * 1024 }, async (err, stdout, stderr) => {
        try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
        
        if (err) {
          console.warn("[RunCode] Docker execution failed. Falling back seamlessly to Piston engine.");
          const pistonRes = await executeWithPiston(language || "javascript", code, fileName);
          if (release) release();
          resolve(NextResponse.json(pistonRes));
          return;
        }

        if (release) release();
        
        resolve(NextResponse.json({
          stdout: stdout || "",
          stderr: stderr || "",
          exitCode: 0,
        }));
      });
    });
  } catch (err) {
    if (release) release();
    console.warn("[RunCode] Error in execution handler. Attempting Piston fallback.", err);
    try {
      const { code, language, fileName: retryFileName } = await req.clone().json();
      if (code && typeof code === "string") {
        const pistonRes = await executeWithPiston(language || "javascript", code, retryFileName);
        return NextResponse.json(pistonRes);
      }
    } catch {}
    return NextResponse.json({ stdout: "", stderr: `Execution error: ${String(err)}`, exitCode: 1 }, { status: 500 });
  }
}
