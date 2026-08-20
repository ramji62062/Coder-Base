import { createClient } from "@supabase/supabase-js";

const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function createFallbackSupabaseClient() {
  const makeQuery = () => {
    const chain: Record<string, any> = {
      select: () => chain,
      eq: () => chain,
      neq: () => chain,
      in: () => chain,
      or: () => chain,
      order: () => chain,
      limit: () => chain,
      range: () => chain,
      update: () => chain,
      delete: () => chain,
      insert: async () => ({ data: null, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({ data: null, error: null }),
    };
    return chain;
  };

  return {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
      signInWithPassword: async () => ({ data: null, error: null }),
      signUp: async () => ({ data: null, error: null }),
      signOut: async () => ({ error: null }),
      resetPasswordForEmail: async () => ({ data: null, error: null }),
      updateUser: async () => ({ data: { user: null }, error: null }),
      exchangeCodeForSession: async () => ({ data: { session: null }, error: null }),
      setSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: () => makeQuery(),
    channel: () => ({
      on: () => ({ subscribe: async () => ({ data: null, error: null }) }),
      send: () => {},
      unsubscribe: async () => {},
    }),
    removeChannel: () => {},
  };
}

const normalizedUrl = rawSupabaseUrl
  ? rawSupabaseUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "")
  : "https://placeholder.supabase.co";

export const supabase = rawSupabaseUrl && supabaseAnonKey
  ? createClient(normalizedUrl, supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } })
  : createFallbackSupabaseClient() as any;
