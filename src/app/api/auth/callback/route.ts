import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const type = url.searchParams.get("type"); // e.g., "recovery"
  const next = url.searchParams.get("next") || "/reset-password";

  // If there's a code, exchange it server-side and redirect with tokens in the hash
  if (code) {
    const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "")
      .replace(/\/rest\/v1\/?$/, "")
      .replace(/\/+$/, "");
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

    if (supabaseUrl && supabaseAnonKey) {
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      if (!error && data.session) {
        // Redirect to reset-password page with tokens in hash fragment
        // The client-side page will pick up these tokens via setSession
        const redirectUrl = new URL(next, url.origin);
        redirectUrl.hash = `access_token=${data.session.access_token}&refresh_token=${data.session.refresh_token}&type=recovery`;
        return NextResponse.redirect(redirectUrl.toString());
      }
    }

    // Code exchange failed — redirect to reset-password with error
    const errorUrl = new URL("/reset-password", url.origin);
    errorUrl.hash = "error=invalid_code&error_description=This reset link is invalid or has expired. Please request a new one.";
    return NextResponse.redirect(errorUrl.toString());
  }

  // If no code is present on the server (e.g. hash fragment redirect), redirect to the target page
  const redirectUrl = new URL(next, url.origin);
  // Forward any query params (like error, error_description, etc.)
  url.searchParams.forEach((value, key) => {
    if (key !== "next") redirectUrl.searchParams.set(key, value);
  });
  return NextResponse.redirect(redirectUrl.toString());
}

