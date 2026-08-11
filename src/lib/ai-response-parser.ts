export type ParsedCodeBlock = {
  language: string;
  fileName?: string;
  code: string;
};

export type ParsedNoteBlock = {
  title: string;
  content: string;
};

export type ParsedWhiteboardElement = {
  type: "text" | "rect" | "line" | "arrow" | "circle";
  x: number;
  y: number;
  w?: number;
  h?: number;
  text?: string;
  color?: string;
  points?: { x: number; y: number }[];
};

function parseFenceHeader(header: string): { language: string; fileName?: string; noteTitle?: string } {
  const trimmed = header.trim();
  if (trimmed.startsWith("file:")) {
    return { language: "file", fileName: trimmed.slice(5).trim() };
  }
  if (trimmed.startsWith("note:")) {
    return { language: "note", noteTitle: trimmed.slice(5).trim() };
  }
  if (trimmed.startsWith("whiteboard")) {
    return { language: "whiteboard" };
  }
  const colon = trimmed.indexOf(":");
  if (colon > 0) {
    const lang = trimmed.slice(0, colon).trim();
    const rest = trimmed.slice(colon + 1).trim();
    if (rest && /^[\w./-]+$/.test(rest)) {
      return { language: lang, fileName: rest };
    }
  }
  return { language: trimmed || "text" };
}

export function extractCodeBlocks(content: string): ParsedCodeBlock[] {
  const blocks: ParsedCodeBlock[] = [];
  const regex = /```([^\n]*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const { language, fileName } = parseFenceHeader(match[1]);
    if (language === "note" || language === "whiteboard") continue;
    let code = match[2].trim();
    if (!code) continue;
    code = code.replace(/^```[\s\S]*?```$/gm, '').trim();
    if (!code) continue;
    blocks.push({ language, fileName, code });
  }
  return blocks;
}

export function extractNoteBlocks(content: string): ParsedNoteBlock[] {
  const notes: ParsedNoteBlock[] = [];
  const regex = /```(?:note(?::([^\n]*))?)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    notes.push({
      title: (match[1] || "AI Note").trim() || "AI Note",
      content: match[2].trim(),
    });
  }
  return notes;
}

export function extractWhiteboardBlocks(content: string): ParsedWhiteboardElement[] {
  const elements: ParsedWhiteboardElement[] = [];
  const regex = /```whiteboard\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (Array.isArray(parsed)) {
        elements.push(...parsed);
      }
    } catch {
      // Plain-text architecture fallback: one text box per line
      match[1].trim().split("\n").forEach((line, i) => {
        const text = line.trim();
        if (!text) return;
        elements.push({ type: "text", x: 80, y: 80 + i * 48, text, color: "#ffffff" });
      });
    }
  }
  return elements;
}
