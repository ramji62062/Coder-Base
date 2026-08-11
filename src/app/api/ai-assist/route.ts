import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const PRIMARY_MODEL = "llama-3.3-70b-versatile";
const FALLBACK_MODEL = "llama-3.1-8b-instant";
const MAX_RETRIES = 2;

async function callGroq(
  groqKey: string,
  body: Record<string, unknown>,
  model: string,
  signal?: AbortSignal
): Promise<Response> {
  return fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${groqKey}`,
    },
    body: JSON.stringify({ ...body, model }),
    signal,
  });
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(req: NextRequest) {
  try {
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      return NextResponse.json(
        { error: "GROQ_API_KEY is not set in .env.local. Add your Groq API key to enable AI assistance." },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { messages = [], language = "javascript", activeFile = "", autoWrite = false, files = [] } = body;

const autoWriteInstructions = autoWrite ? `

## AUTO GENERATION MODE

You are an AI coding assistant with Auto Generation enabled. Write COMPLETE, CORRECT, RUNNABLE code.

RULES:
1. Write ALL code needed — never partial, never placeholders
2. Include ALL imports, error handling, edge cases
3. Every code block MUST be syntactically valid
4. If creating a project, create ALL necessary files (HTML, CSS, JS, etc.)
5. Test logic mentally before outputting
6. For projects: always include index.html as entry point
7. EVERY code block must include the exact target path after file:
8. If the user asks for work in a folder, put files inside that folder path
9. Reuse existing workspace files when fixing or improving code

OUTPUT FORMAT:
\`\`\`file:path/to/filename.ext
complete working code
\`\`\`

For projects, create multiple files:
- index.html (main entry)
- style.css (styling)
- script.js or main.js (logic)
- Any other needed files

Each file MUST be complete and work together as a project.
Never output unlabeled code blocks in Auto Generation mode.` : "";

    const fileList = Array.isArray(files) && files.length ? `\nWorkspace files: ${files.join(", ")}` : "";

    const systemPrompt = autoWrite
      ? `You are CodeTogether AI, an autonomous coding assistant with Auto Generation mode. Write complete, working code.

Active File: ${activeFile}
Language: ${language}${fileList}

RULES:
1. Write COMPLETE, WORKING, RUNNABLE code — never partial
2. Include ALL imports, error handling
3. Create ALL files needed for projects (HTML, CSS, JS)
4. Every code block must be syntactically valid
5. Use format: \`\`\`file:path/to/filename.ext\\n...code...\\\`\`
6. For projects: always include index.html as entry point
7. Never use an unlabeled code block; every block needs file:
8. Choose the correct existing file when modifying code
9. Choose the correct folder path from Workspace files when creating files
10. Do not assume you have the current file contents unless the user pasted or attached them

${autoWriteInstructions}`
      : `You are CodeTogether AI, an expert programming assistant.
Active File: ${activeFile}
Language: ${language}${fileList}

Provide correct, precise coding assistance. Format code using markdown code blocks.
Auto Generation is OFF, so explain changes and show code in chat only. Do not claim files were changed unless the user applies a block manually.
Do not assume you have the current file contents unless the user pasted or attached them.`;

    const groqMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map((m: any) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      })),
    ];

    const requestBody = {
      messages: groqMessages,
      temperature: 0.4,
      max_tokens: 3000,
      stream: true,
    };

    // Try primary model with retries, then fallback model
    const models = [PRIMARY_MODEL, FALLBACK_MODEL];
    let lastError = "";

    for (const model of models) {
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const res = await callGroq(groqKey, requestBody, model);

          if (res.ok) {
            // Successful streaming response
            return new NextResponse(res.body, {
              status: 200,
              headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
              },
            });
          }

          // Parse error
          const errBody = await res.json().catch(() => ({ error: "Unknown API error" }));
          const errMsg =
            typeof errBody.error === "string"
              ? errBody.error
              : errBody.error?.message || errBody.message || `API error (${res.status})`;

          lastError = errMsg;

          // If rate limited or overloaded, retry with backoff
          if (res.status === 429 || res.status === 503 || errMsg.includes("overloaded") || errMsg.includes("too large")) {
            const delay = Math.min(1000 * Math.pow(2, attempt), 3000);
            await sleep(delay);
            continue;
          }

          // Non-retryable error (auth, bad request, etc.)
          if (model === FALLBACK_MODEL) {
            return NextResponse.json({ error: errMsg }, { status: res.status });
          }

          break; // Move to fallback model
        } catch (fetchErr: any) {
          lastError = fetchErr.message || "Network error";
          // Network error — retry
          if (attempt < MAX_RETRIES - 1) {
            await sleep(1000 * Math.pow(2, attempt));
            continue;
          }
          if (model === FALLBACK_MODEL) {
            throw fetchErr;
          }
          break; // Move to fallback model
        }
      }
    }

    return NextResponse.json(
      { error: `AI service is temporarily unavailable. ${lastError ? "Error: " + lastError : "Please try again."}` },
      { status: 503 }
    );
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
