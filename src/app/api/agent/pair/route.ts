import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const pairing = require("../../../../../server/agent-pairing.js");

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const roomId = String(body.roomId || "");
    const authHeader = req.headers.get("authorization") || "";
    const authToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
    const userId = typeof body.userId === "string" ? body.userId : undefined;

    const result = await pairing.createPairing({ authToken, roomId, userId });
    if (!result.ok) {
      return NextResponse.json({ error: result.error || "Unable to create local-agent pairing." }, { status: 401 });
    }

    return NextResponse.json({
      token: result.token,
      roomId: result.roomId,
      expiresAt: result.expiresAt,
      ttlMs: result.ttlMs,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to create local-agent pairing." }, { status: 500 });
  }
}
