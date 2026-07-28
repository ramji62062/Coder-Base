import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const { user: authUser, error: authError } = await getAuthenticatedUser(req);
    if (!authUser) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Fetch user basic details
    const { data: user, error: userErr } = await supabaseAdmin
      .from("users")
      .select("id, name, email, avatar_url, role")
      .eq("id", userId)
      .maybeSingle();

    if (userErr || !user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Fetch user profile details from tutor_profiles
    const { data: tutorProfile, error: profileErr } = await supabaseAdmin
      .from("tutor_profiles")
      .select("bio, skills, availability_json")
      .eq("user_id", userId)
      .maybeSingle();

    const isOwnProfile = authUser.id === userId;
    const profileData = {
      id: user.id,
      name: user.name || "",
      avatarUrl: user.avatar_url || "",
      role: user.role || "student",
      bio: tutorProfile?.bio || "",
      skills: tutorProfile?.skills || [],
      ...(isOwnProfile
        ? {
            email: user.email || "",
            links: tutorProfile?.availability_json || { youtube: "", github: "", instagram: "", other: "" },
          }
        : {}),
    };

    return NextResponse.json(profileData);
  } catch (err) {
    console.error("[Profile GET] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user: authUser, error: authError } = await getAuthenticatedUser(req);
    if (!authUser) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const body = await req.json();
    const { name, avatarUrl, bio, skills, links } = body;
    const userId = authUser.id;

    const supabaseAdmin = getSupabaseAdmin();

    // 1. Update public.users
    const { error: userErr } = await supabaseAdmin
      .from("users")
      .update({
        name: name !== undefined ? name : undefined,
        avatar_url: avatarUrl !== undefined ? avatarUrl : undefined,
      })
      .eq("id", userId);

    if (userErr) {
      console.error("[Profile POST] Users update error:", userErr);
      return NextResponse.json({ error: userErr.message }, { status: 500 });
    }

    // 2. Fetch or update tutor_profiles
    const { data: existingProfile } = await supabaseAdmin
      .from("tutor_profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingProfile?.id) {
      // Update
      const { error: profileErr } = await supabaseAdmin
        .from("tutor_profiles")
        .update({
          bio: bio !== undefined ? bio : undefined,
          skills: skills !== undefined ? skills : undefined,
          availability_json: links !== undefined ? links : undefined,
        })
        .eq("id", existingProfile.id);

      if (profileErr) {
        console.error("[Profile POST] tutor_profiles update error:", profileErr);
        return NextResponse.json({ error: profileErr.message }, { status: 500 });
      }
    } else {
      // Insert
      const { error: profileErr } = await supabaseAdmin
        .from("tutor_profiles")
        .insert({
          user_id: userId,
          bio: bio || "",
          skills: skills || [],
          availability_json: links || { youtube: "", github: "", instagram: "", other: "" },
          hourly_rate: 0,
          rating: 5,
        });

      if (profileErr) {
        console.error("[Profile POST] tutor_profiles insert error:", profileErr);
        return NextResponse.json({ error: profileErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Profile POST] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected server error" },
      { status: 500 },
    );
  }
}
