import { createClient } from "@supabase/supabase-js";

/**
 * ⚠️ SERVICE-ROLE client — BYPASSES Row Level Security.
 *
 * This is the privileged key. It is used in EXACTLY ONE place: the Stripe
 * webhook handler, to WRITE subscription status into `public.subscriptions`
 * (the table that the RLS policy reads). It is NEVER used for user-facing
 * or gated reads — doing so would defeat the entire point of the demo.
 *
 * Never import this from client components or from any read path that serves
 * listing detail to a user.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}
