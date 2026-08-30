import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, statSync } from "fs";
import { join, normalize, sep } from "path";

export const dynamic = "force-dynamic";

const WORKSPACE_ROOT = join(process.cwd(), "temp_workspaces");

const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  md: "text/plain; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  wasm: "application/wasm",
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

function mimeFor(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  return MIME[ext] || "application/octet-stream";
}

function sanitize(rel: string): string | null {
  const clean = normalize(rel).replace(/^(\.\.(\/|\\|$))+/, "").replace(/^[\\/]+/, "");
  if (clean.includes("..")) return null;
  return clean.replace(/\\/g, "/");
}

function notFound(message: string, status = 404) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><style>
      body{font-family:-apple-system,Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;min-height:90vh;margin:0;background:#0f1117;color:#e2e8f0}
      .box{max-width:520px;padding:36px;border:1px solid #2a2f3d;border-radius:14px;background:#151926;text-align:center}
      h1{font-size:18px;margin:0 0 10px}p{font-size:13px;color:#94a3b8;line-height:1.6;margin:6px 0}
      code{background:#0d1017;padding:2px 7px;border-radius:5px;color:#7dd3fc;font-size:12px}
    </style></head><body><div class="box"><h1>🔎 ${message}</h1>
    <p>Create an <code>index.html</code> in your workspace, or pick a different file / folder in the preview toolbar.</p>
    <p>To preview a React / Vue / Vite app, run <code>npm run dev -- --host</code> in the terminal — the live server preview opens automatically.</p>
    </div></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

async function fromDatabase(roomId: string, relPath: string): Promise<Buffer | null> {
  try {
    const { data } = await supabase
      .from("rooms")
      .select("files_json")
      .eq("id", roomId)
      .maybeSingle();
    const files: any[] = Array.isArray(data?.files_json) ? data!.files_json : [];
    const wanted = relPath.replace(/\/+$/, "");
    const hit = files.find((f) => !f.isFolder && String(f.path || f.name || "").replace(/\\/g, "/") === wanted);
    if (hit && typeof hit.content === "string") {
      if (hit.content.startsWith("data:") && hit.content.includes(";base64,")) {
        const base64Data = hit.content.split(";base64,").pop()!;
        return Buffer.from(base64Data, "base64");
      }
      return Buffer.from(hit.content, "utf8");
    }
  } catch {}
  return null;
}

function fromDisk(roomId: string, relPath: string): Buffer | null {
  const base = join(WORKSPACE_ROOT, roomId);
  const target = normalize(join(base, relPath));
  if (!target.startsWith(base + sep) && target !== base) return null;
  try {
    if (!existsSync(target)) return null;
    if (statSync(target).isDirectory()) return null;
    if (statSync(target).size > 8 * 1024 * 1024) return null;
    return readFileSync(target);
  } catch {
    return null;
  }
}

async function getLiveMtime(roomId: string): Promise<number> {
  const base = join(WORKSPACE_ROOT, roomId);
  try {
    if (existsSync(base)) {
      const stats = statSync(base);
      return stats.mtimeMs;
    }
  } catch {}
  try {
    const { data } = await supabase
      .from("rooms")
      .select("updated_at, files_json")
      .eq("id", roomId)
      .maybeSingle();
    if (data?.updated_at) return new Date(data.updated_at).getTime();
  } catch {}
  return Date.now();
}

async function serveFile(roomId: string, rawPath: string): Promise<Response> {
  if (rawPath === "__live_ping") {
    const mtime = await getLiveMtime(roomId);
    return new Response(JSON.stringify({ ok: true, mtime }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  const rel = sanitize(rawPath);
  if (rel === null) return notFound("Invalid path", 400);
  const path = rel === "" ? "index.html" : rel;

  // Directory request -> its index.html
  let candidate = path;
  const diskDirProbe = normalize(join(WORKSPACE_ROOT, roomId, candidate));
  try {
    if (existsSync(diskDirProbe) && statSync(diskDirProbe).isDirectory()) {
      candidate = `${candidate}/index.html`;
    }
  } catch {}

  const buffer =
    (await fromDatabase(roomId, candidate)) ??
    fromDisk(roomId, candidate) ??
    (candidate !== path ? (await fromDatabase(roomId, path)) ?? fromDisk(roomId, path) : null);

  if (!buffer) return notFound(`Not found: ${path}`);

  const mime = mimeFor(candidate);
  if (mime.startsWith("text/html")) {
    const htmlText = buffer.toString("utf8");
    const reloadScript = `
<!-- CodeTogether Live Server (Live Reload Extension) -->
<script>
(function() {
  let lastMtime = 0;
  let failCount = 0;
  async function checkLiveUpdate() {
    try {
      const res = await fetch('/api/workspace/${roomId}/__live_ping?t=' + Date.now(), { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (lastMtime && data.mtime > lastMtime) {
          console.log('[Live Server] Workspace files changed. Reloading page...');
          window.location.reload();
          return;
        }
        lastMtime = data.mtime;
        failCount = 0;
      }
    } catch (e) {
      failCount++;
    }
    setTimeout(checkLiveUpdate, failCount > 5 ? 2000 : 600);
  }
  setTimeout(checkLiveUpdate, 600);
})();
</script>
`;
    let modifiedHtml = htmlText;
    if (modifiedHtml.includes("</body>")) {
      modifiedHtml = modifiedHtml.replace("</body>", `${reloadScript}</body>`);
    } else if (modifiedHtml.includes("</html>")) {
      modifiedHtml = modifiedHtml.replace("</html>", `${reloadScript}</html>`);
    } else {
      modifiedHtml += reloadScript;
    }
    return new Response(modifiedHtml, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  }

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: { "Content-Type": mime, "Cache-Control": "no-store" },
  });
}

type Ctx = { params: { roomId: string; path?: string[] } };

export async function GET(_req: Request, ctx: Ctx) {
  const { roomId, path } = ctx.params;
  if (!/^[0-9a-f-]{16,40}$/i.test(roomId || "")) return notFound("Invalid room", 400);
  const rel = (path || []).map((s) => decodeURIComponent(s)).join("/");
  return serveFile(roomId, rel);
}
