import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client — uses the ANON key + the logged-in user's session.
 * All gated, user-facing reads go through this (or the server client below).
 * RLS is fully in force here. This client can NEVER bypass RLS.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
