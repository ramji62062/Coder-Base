import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const VALID_ROLES = new Set(["student", "tutor", "business", "freelancer"]);
const ROLE_ALIASES: Record<string, string> = {
  student: "student",
  tutor: "tutor",
  teacher: "tutor",
  freelancer: "freelancer",
  creator: "freelancer",
  youtube: "freelancer",
  business: "business",
};

function normalizeRole(value?: string) {
  const raw = (value || "").trim().toLowerCase();
  return ROLE_ALIASES[raw] || "student";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      email?: string;
      password?: string;
      role?: string;
    };

    const name = (body.name || "").trim();
    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";
    const role = VALID_ROLES.has(normalizeRole(body.role)) ? normalizeRole(body.role) : "student";

    if (!name) {
      return NextResponse.json({ error: "Full name is required." }, { status: 400 });
    }
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role },
    });

    if (createError || !data.user) {
      const message = createError?.message || "Could not create account.";
      const alreadyRegistered = /already|registered|exists/i.test(message);
      return NextResponse.json(
        { error: alreadyRegistered ? "Email already registered. Try logging in." : message },
        { status: alreadyRegistered ? 409 : 400 },
      );
    }

    const { error: profileError } = await supabaseAdmin
      .from("users")
      .upsert(
        {
          id: data.user.id,
          name,
          email,
          role,
        },
        { onConflict: "id" },
      );

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(data.user.id).catch(() => {});
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    return NextResponse.json({ id: data.user.id, email });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected server error" },
      { status: 500 },
    );
  }
}
