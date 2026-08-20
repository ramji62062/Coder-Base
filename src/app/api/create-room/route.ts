import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { generateRoomCode } from "@/lib/utils";
import { getAuthenticatedUser } from "@/lib/auth";

const STARTER_BY_LANGUAGE: Record<string, string> = {
  javascript: 'function greet(name) {\n  return `Hello, ${name}!`;\n}\n\nconsole.log(greet("CodeTogether"));\n',
  typescript:
    'type User = { name: string };\n\nfunction greet(user: User): string {\n  return `Hello, ${user.name}!`;\n}\n\nconsole.log(greet({ name: "CodeTogether" }));\n',
  python: 'def greet(name):\n    return f"Hello, {name}!"\n\nprint(greet("CodeTogether"))\n',
  java: 'public class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello, CodeTogether!");\n  }\n}\n',
  cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n  cout << "Hello, CodeTogether!" << endl;\n  return 0;\n}\n',
  go: 'package main\n\nimport "fmt"\n\nfunc main() {\n  fmt.Println("Hello, CodeTogether!")\n}\n',
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      createdBy?: string;
      roomName?: string;
      language?: string;
      files?: any[];
      isLibrary?: boolean;
      isPrivate?: boolean;
      accessCode?: string;
      category?: string;
      description?: string;
      authorName?: string;
    };

    const { user } = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "A valid user session is required" }, { status: 401 });
    }

    const selectedLanguage = (body.language || "javascript").toLowerCase();
    const starterCode = STARTER_BY_LANGUAGE[selectedLanguage] || STARTER_BY_LANGUAGE.javascript;
    const roomCode = generateRoomCode(6);
    const supabaseAdmin = getSupabaseAdmin();

    let finalRoomName = body.roomName || "Live Coding Room";
    if (!finalRoomName.startsWith("{") && (body.isPrivate || body.isLibrary || body.category || body.accessCode)) {
      finalRoomName = JSON.stringify({
        title: body.roomName || "Workspace",
        isLibrary: Boolean(body.isLibrary),
        isPrivate: Boolean(body.isPrivate),
        accessCode: body.accessCode ? String(body.accessCode).trim() : "",
        category: body.category || "Others",
        description: body.description || "",
        authorName: body.authorName || user?.email?.split("@")[0] || "User",
      });
    }

    const { data: room, error } = await supabaseAdmin
      .from("rooms")
      .insert({
        name: finalRoomName,
        room_code: roomCode,
        created_by: user.id,
        language: selectedLanguage,
        files_json: body.files || null,
        code_content: body.files ? null : starterCode,
        is_active: !body.isLibrary,
      })
      .select("id, room_code")
      .single();

    if (error || !room) {
      return NextResponse.json({ error: error?.message || "Failed to save room" }, { status: 500 });
    }

    return NextResponse.json(room);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected server error" },
      { status: 500 },
    );
  }
}
