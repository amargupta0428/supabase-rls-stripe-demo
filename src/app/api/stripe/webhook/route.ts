import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Stripe webhook. This is the ONLY place the service-role key is used to write
 * subscription state. It:
 *   1. Verifies the Stripe signature against STRIPE_WEBHOOK_SECRET (reject if bad).
 *   2. Handles the required events idempotently (upsert keyed by user_id).
 *   3. Writes status into public.subscriptions — the table the RLS policy reads,
 *      so billing state directly drives database-level access.
 *
 * Must read the RAW body for signature verification — middleware excludes this
 * route, and we never parse the body before verifying.
 */

// current_period_end moved onto subscription items in recent API versions.
function periodEnd(sub: Stripe.Subscription): string | null {
  const top = (sub as unknown as { current_period_end?: number })
    .current_period_end;
  const item = sub.items?.data?.[0] as unknown as {
    current_period_end?: number;
  };
  const epoch = top ?? item?.current_period_end;
  return epoch ? new Date(epoch * 1000).toISOString() : null;
}

async function writeSubscription(params: {
  userId?: string | null;
  customerId: string;
  subscriptionId?: string | null;
  status: string;
  priceId?: string | null;
  currentPeriodEnd?: string | null;
}) {
  const admin = createAdminClient();

  // Resolve the user. Prefer an explicit id (from checkout/metadata); otherwise
  // map via the stored stripe_customer_id.
  let userId = params.userId ?? null;
  if (!userId) {
    const { data } = await admin
      .from("subscriptions")
      .select("user_id")
      .eq("stripe_customer_id", params.customerId)
      .maybeSingle();
    userId = data?.user_id ?? null;
  }

  if (!userId) {
    console.warn(
      `[webhook] could not resolve user for customer ${params.customerId}; skipping`,
    );
    return;
  }

  const { error } = await admin.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: params.customerId,
      stripe_subscription_id: params.subscriptionId ?? null,
      status: params.status,
      price_id: params.priceId ?? null,
      current_period_end: params.currentPeriodEnd ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("[webhook] upsert failed:", error.message);
    throw error;
  }
  console.log(`[webhook] user ${userId} -> status ${params.status}`);
}

function fromSubscription(
  sub: Stripe.Subscription,
  userId?: string | null,
): Parameters<typeof writeSubscription>[0] {
  return {
    userId: userId ?? (sub.metadata?.supabase_user_id || null),
    customerId:
      typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    subscriptionId: sub.id,
    status: sub.status,
    priceId: sub.items?.data?.[0]?.price?.id ?? null,
    currentPeriodEnd: periodEnd(sub),
  };
}

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("[webhook] signature verification failed:", msg);
    return NextResponse.json({ error: `Invalid signature` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId =
          session.client_reference_id ||
          session.metadata?.supabase_user_id ||
          null;

        // Pull the full subscription to capture trialing/active status.
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id,
          );
          await writeSubscription(fromSubscription(sub, userId));
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await writeSubscription(fromSubscription(sub));
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await writeSubscription({
          ...fromSubscription(sub),
          status: "canceled",
        });
        break;
      }

      case "invoice.payment_failed": {
        // Revoke access: a failed renewal payment flips the user to past_due,
        // which the RLS policy does NOT consider active.
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === "string"
            ? invoice.customer
            : invoice.customer?.id;
        const subId = (invoice as unknown as { subscription?: string | null })
          .subscription;

        if (customerId) {
          await writeSubscription({
            customerId,
            subscriptionId: typeof subId === "string" ? subId : null,
            status: "past_due",
          });
        }
        break;
      }

      default:
        // Ignore everything else.
        break;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error(`[webhook] handler error for ${event.type}:`, msg);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
