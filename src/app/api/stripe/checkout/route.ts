import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Creates a Stripe Checkout Session in `subscription` mode with a free trial.
 * Requires a logged-in user. The user's id is attached as client_reference_id
 * AND metadata so the webhook can map the resulting subscription back to them.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const stripe = getStripe();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const trialDays = Number(process.env.STRIPE_TRIAL_PERIOD_DAYS ?? "7");

  // Re-use an existing Stripe customer for this user if we have one.
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  let customerId = existing?.stripe_customer_id ?? undefined;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;

    // Persist the mapping immediately so later webhooks can resolve the user.
    await admin.from("subscriptions").upsert(
      {
        user_id: user.id,
        stripe_customer_id: customerId,
        status: "none",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.id,
    // Card-only keeps the demo focused (no Klarna / Cash App / wallets).
    payment_method_types: ["card"],
    line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
    subscription_data: {
      trial_period_days: trialDays,
      metadata: { supabase_user_id: user.id },
    },
    metadata: { supabase_user_id: user.id },
    success_url: `${siteUrl}/?checkout=success`,
    cancel_url: `${siteUrl}/?checkout=cancelled`,
    allow_promotion_codes: false,
  });

  return NextResponse.json({ url: session.url });
}
