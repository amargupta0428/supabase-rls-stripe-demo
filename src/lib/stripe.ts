import Stripe from "stripe";

/**
 * Server-side Stripe client (TEST-MODE secret key only). Lazily initialized so
 * that importing this module during `next build` doesn't require the key to be
 * present — it's only constructed when first actually used at runtime.
 * Never import this into client components.
 */
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-05-27.dahlia",
      typescript: true,
    });
  }
  return _stripe;
}

/** Subscription statuses that grant access (must match the RLS policy). */
export const ACTIVE_STATUSES = ["active", "trialing"] as const;
