import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export const runtime = "nodejs";

export async function GET() {
  const agentPath = join(process.cwd(), "agent", "index.js");
  if (!existsSync(agentPath)) {
    return NextResponse.json({ error: "Agent script not found." }, { status: 404 });
  }

  const content = readFileSync(agentPath, "utf8");
  return new NextResponse(content, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
    },
  });
}
