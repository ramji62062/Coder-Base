import { NextRequest, NextResponse } from "next/server";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_WHITEBOARD_MODEL || "openai/gpt-oss-120b";

const SYSTEM_PROMPT = `You are a whiteboard diagram generator. You ONLY output JSON arrays. No code, no explanations, no text outside the JSON.

OUTPUT FORMAT: A JSON array of objects. Each object represents a shape on a whiteboard.

SHAPE TYPES:
1. Rectangle with text: {"type":"rect","x":100,"y":100,"w":160,"h":80,"color":"#ffffff","text":"Server Name"}
2. Circle with text: {"type":"circle","x":300,"y":100,"w":100,"h":100,"color":"#10B981","text":"Database"}
3. Arrow: {"type":"arrow","points":[{"x":260,"y":140},{"x":300,"y":140}],"color":"#ffffff"}
4. Title text: {"type":"text","x":400,"y":30,"text":"Architecture Title","color":"#ffffff","fontSize":24}

RULES:
- Output ONLY the JSON array, nothing else
- Every shape MUST have a "text" field with a label
- Colors: "#ffffff" (white), "#10B981" (green), "#F59E0B" (amber), "#EF4444" (red), "#ffffff" (white), "#ffffff" (white)
- Space shapes so they don't overlap (x: 80-800, y: 30-500)
- Add arrows to connect related shapes
- Include a title at the top
- Return 6-12 shapes total

EXAMPLE OUTPUT:
[
  {"type":"text","x":400,"y":30,"text":"System Architecture","color":"#ffffff","fontSize":24},
  {"type":"rect","x":100,"y":100,"w":160,"h":80,"color":"#ffffff","text":"Frontend"},
  {"type":"rect","x":350,"y":100,"w":160,"h":80,"color":"#ffffff","text":"API Gateway"},
  {"type":"rect","x":600,"y":100,"w":160,"h":80,"color":"#10B981","text":"Database"},
  {"type":"arrow","points":[{"x":260,"y":140},{"x":350,"y":140}],"color":"#ffffff"},
  {"type":"arrow","points":[{"x":510,"y":140},{"x":600,"y":140}],"color":"#ffffff"}
]`;

export async function POST(req: NextRequest) {
  try {
    const { prompt, type } = await req.json();

    if (!GROQ_API_KEY) {
      return NextResponse.json({ error: "GROQ API key not configured" }, { status: 500 });
    }

    const userMessage = `Create a ${type} architecture diagram for: "${prompt}"

Return ONLY a JSON array of shapes. Every rectangle and circle MUST have a "text" field with its label.`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        temperature: 0.2,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Groq API error:", errText);
      return NextResponse.json({ error: "AI service error" }, { status: 500 });
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || "";

    content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("No JSON array found in response:", content);
      return NextResponse.json({ elements: [], error: "Invalid response format" });
    }

    let elements;
    try {
      elements = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error("JSON parse failed:", parseErr, "Raw:", jsonMatch[0]);
      return NextResponse.json({ elements: [], error: "Failed to parse response" });
    }

    if (!Array.isArray(elements)) {
      return NextResponse.json({ elements: [], error: "Response is not an array" });
    }

    elements = elements.map((el: Record<string, unknown>, i: number) => ({
      id: `el_ai_${Date.now()}_${i}`,
      type: el.type || "rect",
      x: Number(el.x) || 100 + i * 120,
      y: Number(el.y) || 100,
      w: Number(el.w) || 150,
      h: Number(el.h) || 70,
      color: el.color || "#ffffff",
      lineWidth: 3,
      text: el.text || "",
      points: el.points || undefined,
      fontSize: Number(el.fontSize) || 16,
    }));

    return NextResponse.json({ elements });
  } catch (error) {
    console.error("AI whiteboard error:", error);
    return NextResponse.json({ elements: [], error: "Server error" }, { status: 500 });
  }
}
