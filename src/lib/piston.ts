export type PistonResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

const PISTON_ENDPOINT = "https://emkc.org/api/v2/piston/execute";

export const PISTON_LANGUAGE_MAP: Record<string, { language: string; version?: string; fileName: string }> = {
  javascript: { language: "javascript", fileName: "main.js" },
  js: { language: "javascript", fileName: "main.js" },
  typescript: { language: "typescript", fileName: "main.ts" },
  ts: { language: "typescript", fileName: "main.ts" },
  python: { language: "python", fileName: "main.py" },
  py: { language: "python", fileName: "main.py" },
  python3: { language: "python", fileName: "main.py" },
  java: { language: "java", fileName: "Main.java" },
  cpp: { language: "c++", fileName: "main.cpp" },
  "c++": { language: "c++", fileName: "main.cpp" },
  c: { language: "c", fileName: "main.c" },
  csharp: { language: "csharp", fileName: "Main.cs" },
  cs: { language: "csharp", fileName: "Main.cs" },
  "c#": { language: "csharp", fileName: "Main.cs" },
  go: { language: "go", fileName: "main.go" },
  golang: { language: "go", fileName: "main.go" },
  rust: { language: "rust", fileName: "main.rs" },
  rs: { language: "rust", fileName: "main.rs" },
  php: { language: "php", fileName: "main.php" },
  ruby: { language: "ruby", fileName: "main.rb" },
  rb: { language: "ruby", fileName: "main.rb" },
  kotlin: { language: "kotlin", fileName: "Main.kt" },
  kt: { language: "kotlin", fileName: "Main.kt" },
  swift: { language: "swift", fileName: "main.swift" },
  scala: { language: "scala", fileName: "Main.scala" },
  perl: { language: "perl", fileName: "main.pl" },
  pl: { language: "perl", fileName: "main.pl" },
  r: { language: "r", fileName: "main.r" },
  lua: { language: "lua", fileName: "main.lua" },
  dart: { language: "dart", fileName: "main.dart" },
  bash: { language: "bash", fileName: "main.sh" },
  sh: { language: "bash", fileName: "main.sh" },
  shell: { language: "bash", fileName: "main.sh" },
  haskell: { language: "haskell", fileName: "main.hs" },
  hs: { language: "haskell", fileName: "main.hs" },
  elixir: { language: "elixir", fileName: "main.ex" },
  ex: { language: "elixir", fileName: "main.ex" },
  clojure: { language: "clojure", fileName: "main.clj" },
  clj: { language: "clojure", fileName: "main.clj" },
  erlang: { language: "erlang", fileName: "main.erl" },
  erl: { language: "erlang", fileName: "main.erl" },
  nim: { language: "nim", fileName: "main.nim" },
  pascal: { language: "pascal", fileName: "main.pas" },
  pas: { language: "pascal", fileName: "main.pas" },
  fortran: { language: "fortran", fileName: "main.f90" },
  f90: { language: "fortran", fileName: "main.f90" },
  ocaml: { language: "ocaml", fileName: "main.ml" },
  ml: { language: "ocaml", fileName: "main.ml" },
  zig: { language: "zig", fileName: "main.zig" },
  d: { language: "d", fileName: "main.d" },
  julia: { language: "julia", fileName: "main.jl" },
  jl: { language: "julia", fileName: "main.jl" },
  lisp: { language: "lisp", fileName: "main.lisp" },
  cl: { language: "lisp", fileName: "main.lisp" },
  scheme: { language: "scheme", fileName: "main.scm" },
  scm: { language: "scheme", fileName: "main.scm" },
  assembly: { language: "nasm", fileName: "main.asm" },
  asm: { language: "nasm", fileName: "main.asm" },
  nasm: { language: "nasm", fileName: "main.asm" },
  prolog: { language: "prolog", fileName: "main.pl" },
  cobol: { language: "cobol", fileName: "main.cob" },
  cob: { language: "cobol", fileName: "main.cob" },
  crystal: { language: "crystal", fileName: "main.cr" },
  cr: { language: "crystal", fileName: "main.cr" },
  elm: { language: "elm", fileName: "main.elm" },
  groovy: { language: "groovy", fileName: "Main.groovy" },
  racket: { language: "racket", fileName: "main.rkt" },
  rkt: { language: "racket", fileName: "main.rkt" },
  tcl: { language: "tcl", fileName: "main.tcl" },
  fsharp: { language: "fsharp", fileName: "Main.fs" },
  fs: { language: "fsharp", fileName: "Main.fs" },
};

const JUDGE0_LANGUAGE_MAP: Record<string, number> = {
  javascript: 63, js: 63, typescript: 74, ts: 74,
  python: 71, py: 71, python3: 71, java: 62,
  cpp: 54, "c++": 54, c: 50, csharp: 51, cs: 51, "c#": 51,
  go: 60, golang: 60, rust: 73, rs: 73, php: 68,
  ruby: 72, rb: 72, kotlin: 78, kt: 78, swift: 83,
  bash: 46, sh: 46, shell: 46, r: 80, lua: 64, perl: 85
};

function getJavaClassName(code: string): string {
  const match = code.match(/public\s+class\s+([A-Za-z0-9_$]+)/);
  return match ? match[1] : "Main";
}

async function tryJudge0Execution(language: string, code: string): Promise<PistonResult | null> {
  const normLang = (language || "javascript").toLowerCase().trim();
  const langId = JUDGE0_LANGUAGE_MAP[normLang];
  if (!langId) return null;

  try {
    const res = await fetch("https://ce.judge0.com/submissions?wait=true", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language_id: langId,
        source_code: code,
        stdin: "",
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.message?.includes("whitelist")) return null;

    const stdout = data.stdout || "";
    const stderr = data.stderr || data.compile_output || (data.status?.id !== 3 ? data.status?.description : "") || "";
    const exitCode = data.status?.id === 3 ? 0 : 1;

    return { stdout, stderr, exitCode };
  } catch {
    return null;
  }
}

async function tryLocalNodeExecution(language: string, code: string): Promise<PistonResult | null> {
  const normLang = (language || "").toLowerCase();
  if (normLang !== "javascript" && normLang !== "js" && normLang !== "typescript" && normLang !== "ts") {
    return null;
  }

  try {
    const { execSync } = await import("child_process");
    const escapedCode = JSON.stringify(code);
    const output = execSync(`node -e ${escapedCode}`, { timeout: 8000, encoding: "utf-8" });
    return { stdout: output, stderr: "", exitCode: 0 };
  } catch (err: any) {
    const stderr = err.stderr || err.stdout || err.message || "Execution error";
    return { stdout: err.stdout || "", stderr: String(stderr), exitCode: 1 };
  }
}

async function tryLocalPythonExecution(language: string, code: string): Promise<PistonResult | null> {
  const normLang = (language || "").toLowerCase();
  if (normLang !== "python" && normLang !== "py" && normLang !== "python3") {
    return null;
  }

  try {
    const { execSync } = await import("child_process");
    const escapedCode = JSON.stringify(code);
    const output = execSync(`python3 -c ${escapedCode}`, { timeout: 8000, encoding: "utf-8" });
    return { stdout: output, stderr: "", exitCode: 0 };
  } catch (err: any) {
    const stderr = err.stderr || err.stdout || err.message || "Execution error";
    return { stdout: err.stdout || "", stderr: String(stderr), exitCode: 1 };
  }
}

export async function executeWithPiston(language: string, code: string, customFileName?: string): Promise<PistonResult> {
  const normLang = (language || "javascript").toLowerCase().trim();

  // Handle non-executable content types locally rather than falling through to Piston.
  if (normLang === "html") {
    return {
      stdout: `HTML saved to ${customFileName || "index.html"}. Use Preview or open it in a browser.\n`,
      stderr: "",
      exitCode: 0,
    };
  }
  if (normLang === "css") {
    return {
      stdout: `CSS saved to ${customFileName || "style.css"}. Attach it to an HTML file to preview styles.\n`,
      stderr: "",
      exitCode: 0,
    };
  }
  if (normLang === "markdown") {
    return {
      stdout: `Markdown saved to ${customFileName || "README.md"}.\n`,
      stderr: "",
      exitCode: 0,
    };
  }

  // 1. Try Judge0 CE Public Instance
  const judge0Result = await tryJudge0Execution(normLang, code);
  if (judge0Result && (judge0Result.stdout || judge0Result.stderr || judge0Result.exitCode === 0)) {
    return judge0Result;
  }

  // 2. Try Piston API endpoints (engineering mirror and emkc)
  const endpoints = [
    "https://piston.engineering/api/v2/execute",
    "https://emkc.org/api/v2/piston/execute",
  ];

  const config = PISTON_LANGUAGE_MAP[normLang] || { language: normLang || "javascript", fileName: "main.js" };
  let fileName = customFileName || config.fileName;
  if (config.language === "java" && !customFileName) {
    fileName = `${getJavaClassName(code)}.java`;
  }

  const payload = {
    language: config.language,
    version: "*",
    files: [{ name: fileName, content: code }],
  };

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        if (data && !data.message?.includes("whitelist")) {
          const runStdout = data.run?.stdout || "";
          const runStderr = data.run?.stderr || "";
          const runOutput = data.run?.output || "";
          const compileOutput = data.compile?.output || data.compile?.stderr || "";
          const exitCode = data.run?.code ?? 0;

          return {
            stdout: runStdout || (exitCode === 0 ? runOutput : ""),
            stderr: runStderr || (exitCode !== 0 ? runOutput || compileOutput : ""),
            exitCode,
          };
        }
      }
    } catch {
      // try next endpoint
    }
  }

  // 3. Local JS/TS evaluation fallback
  const localNodeResult = await tryLocalNodeExecution(normLang, code);
  if (localNodeResult) return localNodeResult;

  // 4. Local Python evaluation fallback
  const localPythonResult = await tryLocalPythonExecution(normLang, code);
  if (localPythonResult) return localPythonResult;

  return {
    stdout: "",
    stderr: `Failed to execute ${normLang} code. Execution engine unavailable.`,
    exitCode: 1,
  };
}
