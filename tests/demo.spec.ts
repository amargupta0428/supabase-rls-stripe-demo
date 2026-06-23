import { test, expect, type Page } from "@playwright/test";
import crypto from "node:crypto";

/**
 * RLS-gated subscription demo — full proof suite.
 *
 * Self-contained on purpose: all helpers are inlined and only BARE imports are
 * used (@playwright/test, node:crypto). This sidesteps a Playwright 1.61 + Node
 * 22 resolver bug that crashes on relative TS imports — and keeps the proof
 * dependency-free.
 *
 * The data-layer checks talk to Supabase over RAW HTTP (PostgREST + GoTrue) with
 * the user's own JWT — no SDK — which is the strongest possible demonstration
 * that Postgres RLS, not the frontend, withholds the data.
 *
 *   #1 Non-member cannot SEE full detail in the UI.
 *   #2 Non-member's direct DB query returns ZERO detail rows (the critical one).
 *   #3 After Stripe checkout, member gets access (UI + DB).
 *   #5 Trialing user has access during the trial.
 *   #4 invoice.payment_failed → past_due → access revoked (DB + UI).
 *
 * Run: `npm run test:rls` (#1,#2 only) or `npm run test:e2e` (all; needs Stripe
 * keys + a running `stripe listen`).
 */

// ─── env + raw-HTTP helpers ──────────────────────────────────────────────────
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const TEST_PASSWORD = "demo-password-123!";

type Row = Record<string, unknown>;

function assertEnv() {
  const missing = [
    ["NEXT_PUBLIC_SUPABASE_URL", URL_],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", ANON],
    ["SUPABASE_SERVICE_ROLE_KEY", SERVICE],
  ].filter(([, v]) => !v);
  if (missing.length)
    throw new Error(
      `Missing env: ${missing.map(([k]) => k).join(", ")}. Fill in .env.local first.`,
    );
}

function uniqueEmail(tag: string) {
  // No "+" — Supabase Auth rejects plus-addressing as invalid.
  return `demo-${tag}-${crypto.randomBytes(5).toString("hex")}@example.com`;
}

async function signInUser(email: string, password: string) {
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`sign-in failed: ${JSON.stringify(body)}`);
  return { accessToken: body.access_token as string, userId: body.user.id as string };
}

/** Read a table AS THE USER (anon key + user JWT). RLS fully in force. */
async function userSelect(accessToken: string, table: string): Promise<Row[]> {
  const res = await fetch(`${URL_}/rest/v1/${table}?select=*`, {
    headers: { apikey: ANON, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`userSelect ${table} -> ${res.status}`);
  return res.json();
}

/** Read a table with the service role (BYPASSES RLS) — controls only. */
async function adminSelect(table: string, query = ""): Promise<Row[]> {
  const q = query ? `${query}&select=*` : "select=*";
  const res = await fetch(`${URL_}/rest/v1/${table}?${q}`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });
  if (!res.ok) throw new Error(`adminSelect ${table} -> ${res.status}`);
  return res.json();
}

async function getSubscriptionRow(userId: string): Promise<Row | null> {
  const rows = await adminSelect("subscriptions", `user_id=eq.${userId}`);
  return rows[0] ?? null;
}

async function waitForStatus(userId: string, wanted: string[], timeoutMs = 30_000) {
  const start = Date.now();
  for (;;) {
    const row = await getSubscriptionRow(userId);
    const status = (row?.status as string) ?? "none";
    if (wanted.includes(status)) return status;
    if (Date.now() - start > timeoutMs)
      throw new Error(
        `Timed out waiting for status in [${wanted.join(", ")}]; last "${status}". ` +
          "Is `stripe listen --forward-to localhost:3000/api/stripe/webhook` running?",
      );
    await new Promise((r) => setTimeout(r, 1000));
  }
}

async function cleanupUser(userId: string) {
  await fetch(`${URL_}/rest/v1/subscriptions?user_id=eq.${userId}`, {
    method: "DELETE",
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, Prefer: "return=minimal" },
  }).catch(() => {});
  await fetch(`${URL_}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  }).catch(() => {});
}

/** Stripe's exact signature scheme so a crafted event passes webhook verification. */
function stripeSignature(payload: string, secret: string) {
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac("sha256", secret).update(`${t}.${payload}`, "utf8").digest("hex");
  return `t=${t},v1=${sig}`;
}

// ─── #1 + #2 : RLS enforcement (Supabase only) ───────────────────────────────
test.describe("RLS enforcement (no Stripe required)", () => {
  const email = uniqueEmail("nonmember");
  let userId: string | null = null;

  test.beforeAll(() => assertEnv());
  test.afterAll(async () => {
    if (userId) await cleanupUser(userId);
  });

  test("#1 non-member cannot see full listing detail in the UI", async ({ page }) => {
    await page.goto("/login?mode=signup");
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', TEST_PASSWORD);
    await page.click('button:has-text("Sign up")');

    await expect(page.getByTestId("status-nonmember")).toBeVisible();
    const cards = page.getByTestId("listing-card");
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThan(0);
    await expect(page.getByTestId("full-detail")).toHaveCount(0);
    expect(await page.getByTestId("locked-detail").count()).toBeGreaterThan(0);

    console.log("✅ #1 PASS — non-member sees only locked teasers in the UI");
  });

  test("#2 RLS blocks direct DB reads for a non-subscriber (the critical one)", async () => {
    const { accessToken, userId: id } = await signInUser(email, TEST_PASSWORD);
    userId = id;
    expect(userId).toBeTruthy();

    // Control 1: user CAN read public teasers (proves the JWT/request path works).
    const teasers = await userSelect(accessToken, "listings");
    expect(teasers.length).toBeGreaterThan(0);

    // THE ASSERTION: gated detail rows come back EMPTY for the non-subscriber.
    const gated = await userSelect(accessToken, "listing_details");
    expect(gated).toHaveLength(0);

    // Control 2: data really exists — service role (bypasses RLS) sees all of it.
    const all = await adminSelect("listing_details");
    expect(all.length).toBeGreaterThan(0);

    console.log(
      `✅ #2 PASS — user-scoped HTTP read got 0 of ${all.length} detail rows; RLS enforced at the DB`,
    );
  });
});

// ─── #3 + #5 + #4 : full Stripe lifecycle ────────────────────────────────────
const stripeConfigured =
  !!process.env.STRIPE_SECRET_KEY &&
  !!process.env.STRIPE_PRICE_ID &&
  !!process.env.STRIPE_WEBHOOK_SECRET;

test.describe("Stripe subscription lifecycle", () => {
  test.skip(
    !stripeConfigured,
    "Stripe env not set — fill STRIPE_* in .env.local and run `stripe listen` to enable.",
  );

  const email = uniqueEmail("member");
  let userId: string | null = null;

  test.beforeAll(() => assertEnv());
  test.afterAll(async () => {
    if (userId) await cleanupUser(userId);
  });

  test("#3 member gains full access after Stripe checkout", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto("/login?mode=signup");
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', TEST_PASSWORD);
    await page.click('button:has-text("Sign up")');
    await expect(page.getByTestId("status-nonmember")).toBeVisible();

    const { userId: id } = await signInUser(email, TEST_PASSWORD);
    userId = id;
    expect(userId).toBeTruthy();

    await page.getByTestId("subscribe-button").first().click();
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
    await fillStripeCheckout(page);
    await page.waitForURL(/checkout=success/, { timeout: 60_000 });

    const status = await waitForStatus(userId!, ["trialing", "active"], 45_000);
    console.log(`   webhook set status = ${status}`);

    await page.goto("/");
    await expect(page.getByTestId("status-member")).toBeVisible();
    expect(await page.getByTestId("full-detail").count()).toBeGreaterThan(0);

    const { accessToken } = await signInUser(email, TEST_PASSWORD);
    const gated = await userSelect(accessToken, "listing_details");
    expect(gated.length).toBeGreaterThan(0);

    console.log(`✅ #3 PASS — after checkout, member reads ${gated.length} detail rows (UI + DB)`);
  });

  test("#5 trialing user has access during the free trial", async () => {
    expect(userId).toBeTruthy();
    const row = await getSubscriptionRow(userId!);
    expect(row?.status).toBe("trialing");

    const { accessToken } = await signInUser(email, TEST_PASSWORD);
    const gated = await userSelect(accessToken, "listing_details");
    expect(gated.length).toBeGreaterThan(0);

    console.log("✅ #5 PASS — trialing user has full access during trial");
  });

  test("#4 failed payment revokes access at the data layer", async ({ page }) => {
    expect(userId).toBeTruthy();
    const row = await getSubscriptionRow(userId!);
    expect(row?.stripe_customer_id).toBeTruthy();

    await sendSignedPaymentFailed(
      row!.stripe_customer_id as string,
      (row!.stripe_subscription_id as string | null) ?? null,
    );
    await waitForStatus(userId!, ["past_due"], 20_000);

    const { accessToken } = await signInUser(email, TEST_PASSWORD);
    const gated = await userSelect(accessToken, "listing_details");
    expect(gated).toHaveLength(0);

    await page.context().clearCookies();
    await page.goto("/login");
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', TEST_PASSWORD);
    await page.click('button:has-text("Log in")');
    await expect(page.getByTestId("status-nonmember")).toBeVisible();
    await expect(page.getByTestId("full-detail")).toHaveCount(0);

    console.log("✅ #4 PASS — invoice.payment_failed → past_due → access revoked at DB + UI");
  });
});

// ─── Stripe UI + event helpers ───────────────────────────────────────────────
async function fillStripeCheckout(page: Page) {
  // Card-only Checkout renders the card fields directly (no accordion). The
  // inputs are exposed by accessible name, which is stable across Stripe's
  // internal name/id churn. (Email is prefilled + read-only, so skip it.)
  const cardNumber = page.getByRole("textbox", { name: "Card number" });
  await cardNumber.waitFor({ state: "visible", timeout: 20_000 });
  await cardNumber.fill("4242424242424242");
  await page.getByRole("textbox", { name: "Expiration" }).fill("12 / 34");
  await page.getByRole("textbox", { name: "CVC" }).fill("123");
  await page.getByRole("textbox", { name: "Cardholder name" }).fill("Demo Member");

  const zip = page.getByRole("textbox", { name: "ZIP" });
  if ((await zip.count()) > 0 && (await zip.isVisible().catch(() => false)))
    await zip.fill("94107");

  // Avoid the Link sign-up path: uncheck "Save my information" if checked.
  const saveInfo = page.getByRole("checkbox", { name: /Save my information/ });
  if ((await saveInfo.count()) > 0 && (await saveInfo.isChecked().catch(() => false)))
    await saveInfo.uncheck().catch(() => {});

  await page.getByTestId("hosted-payment-submit-button").click({ timeout: 15_000 });
}

async function sendSignedPaymentFailed(customerId: string, subscriptionId: string | null) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET!;
  const event = {
    id: `evt_test_${crypto.randomBytes(8).toString("hex")}`,
    object: "event",
    type: "invoice.payment_failed",
    api_version: "2026-05-27.dahlia",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: `in_test_${crypto.randomBytes(8).toString("hex")}`,
        object: "invoice",
        customer: customerId,
        subscription: subscriptionId,
        billing_reason: "subscription_cycle",
      },
    },
  };
  const payload = JSON.stringify(event);
  const res = await fetch(`${SITE}/api/stripe/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": stripeSignature(payload, secret) },
    body: payload,
  });
  if (!res.ok)
    throw new Error(`webhook POST failed: ${res.status} ${await res.text().catch(() => "")}`);
}
