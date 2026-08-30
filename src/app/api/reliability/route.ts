import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const metrics = require("../../../../server/metrics.js");

export async function GET() {
  return NextResponse.json(metrics.snapshot(), { headers: { "Cache-Control": "no-store" } });
}

// Client-reported reliability events (e.g. save failures after retries)
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const type = String(body?.type || "");
    if (type === "save_failed") metrics.inc("client_save_failures");
    else if (type === "save_retry") metrics.inc("client_save_retries");
    if (body?.detail) metrics.recordError(type || "client_event", body.detail);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
