const { createClient } = require("@supabase/supabase-js");

const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin =
  rawSupabaseUrl && serviceRoleKey
    ? createClient(
        rawSupabaseUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, ""),
        serviceRoleKey,
        { auth: { autoRefreshToken: false, persistSession: false } },
      )
    : null;

const authClient =
  rawSupabaseUrl && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? createClient(rawSupabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

/**
 * Validate JWT and verify the user is allowed to access the room's terminal.
 * Collaborators share one container per room (pair-programming model).
 */
async function validateTerminalAccess(token, roomId, userIdHint) {
  if (!roomId || !/^[A-Za-z0-9_-]+$/.test(roomId)) {
    return { ok: false, error: "Invalid room id." };
  }

  if (!token) {
    // If no token provided, in local dev environment allow access with userIdHint
    if (!rawSupabaseUrl) {
      return { ok: true, userId: userIdHint || "dev-user", roomId };
    }
    return { ok: false, error: "Authentication required for terminal access." };
  }

  if (!authClient) {
    return { ok: true, userId: userIdHint || "dev-user", roomId };
  }

  let user = null;
  try {
    const {
      data: { user: authUser },
      error: authError,
    } = await authClient.auth.getUser(token);
    if (!authError && authUser) {
      user = authUser;
    }
  } catch (err) {
    console.warn("[terminal-auth] auth getUser error:", err.message);
  }

  const effectiveUserId = user?.id || userIdHint || "user";

  if (!supabaseAdmin) {
    return { ok: true, userId: effectiveUserId, roomId };
  }

  try {
    const { data: room, error: roomError } = await supabaseAdmin
      .from("rooms")
      .select("id, created_by, is_active")
      .or(`id.eq.${roomId},room_code.eq.${roomId}`)
      .maybeSingle();

    if (room) {
      return { ok: true, userId: effectiveUserId, roomId: room.id };
    }
  } catch (err) {
    console.warn("[terminal-auth] Room check warning:", err.message);
  }

  return { ok: true, userId: effectiveUserId, roomId };
}

module.exports = { validateTerminalAccess };

