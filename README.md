# BizListings — RLS-Gated Subscription Demo

[![checks](https://github.com/amargupta0428/supabase-rls-stripe-demo/actions/workflows/checks.yml/badge.svg)](https://github.com/amargupta0428/supabase-rls-stripe-demo/actions/workflows/checks.yml)

> **This is a DEMO**, built to prove one specific capability: **content access
> gated by an active paid subscription, enforced at the Postgres database level
> via Supabase Row Level Security (RLS)** — not merely hidden in the frontend or
> the API layer. It is not a production product, has no real users, and uses
> **Stripe test mode only**.

A logged-in user who is **not** an active subscriber is *physically unable* to
read full listing rows. The gate lives in the database: even a direct API/SQL
query made with the user's own credentials (bypassing the UI entirely) returns
**zero** full-detail rows. Flip their Stripe subscription to `active`/`trialing`
and the same query starts returning data — because billing state drives a
Postgres RLS policy.

---

## Why this is database-level, not frontend gating

The data is split across two tables:

| Table | Contents | Who can read |
| --- | --- | --- |
| `public.listings` | Teaser: title, category, location, short blurb, rough price band | **Anyone** (public) |
| `public.listing_details` | Full financials, reason for selling, seller contact | **Only active/trialing subscribers**, enforced by RLS |
| `public.subscriptions` | Stripe billing state per user (`active`/`trialing`/`past_due`/`canceled`/`none`) | Each user reads only their own row |

The gating policy (`supabase/schema.sql`):

```sql
create policy "listing_details_subscribers_read"
  on public.listing_details
  for select
  to authenticated
  using (
    exists (
      select 1 from public.subscriptions s
      where s.user_id = (select auth.uid())
        and s.status in ('active', 'trialing')
    )
  );
```

Because this runs **inside Postgres** for every query, it cannot be bypassed by
calling the API directly, crafting your own Supabase client, or inspecting
network traffic. The only key that *can* bypass RLS — the Supabase
**service-role key** — is used in exactly one place: the Stripe webhook handler,
to **write** subscription status. It is **never** used for user-facing reads.

```
Stripe (billing events)
        │  signed webhook
        ▼
/api/stripe/webhook ──(service role: WRITE only)──► public.subscriptions
                                                          │
                                            RLS policy reads this row
                                                          │
User's browser/JWT ──(anon key: user-scoped READ)──► public.listing_details
                                                  (rows returned only if subscribed)
```

---

## Stack

- **Next.js (App Router) + TypeScript + Tailwind CSS**
- **Supabase** — Postgres + Auth (email/password). RLS does the gating.
- **Stripe** — subscription checkout with a free trial (**test mode only**).
- **Vercel**-ready.

---

## One-time setup

You need a Supabase project and a Stripe test-mode account. See the inline
comments in [`.env.example`](./.env.example) for exactly where each value comes
from, then:

1. **Copy env and fill it in**
   ```bash
   cp .env.example .env.local
   # fill every value (Supabase URL/keys + DATABASE_URL, Stripe test keys + price id)
   ```

2. **Apply schema + seed (~20 listings)**
   ```bash
   npm run db:setup        # uses DATABASE_URL via psql
   ```
   *(Or paste `supabase/schema.sql` then `supabase/seed.sql` into the Supabase
   SQL Editor.)*

3. **Disable email confirmation** (demo convenience): Supabase Dashboard →
   Authentication → Providers → Email → turn **off** "Confirm email".

4. **Run the app**
   ```bash
   npm run dev
   ```

5. **Forward Stripe webhooks** (separate terminal, leave running) and put the
   printed `whsec_…` into `STRIPE_WEBHOOK_SECRET`:
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```

---

## Which keys are safe vs secret

| ✅ Safe to expose (browser / `NEXT_PUBLIC_`) | 🔒 Must stay secret (server only) |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `SUPABASE_SERVICE_ROLE_KEY` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `STRIPE_SECRET_KEY` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `STRIPE_WEBHOOK_SECRET` |
| | `DATABASE_URL` |

`.env*` (except `.env.example`) is gitignored. **Never commit `.env.local`.**
Use **Stripe test-mode keys only** — never live keys.

---

## The Stripe webhook

Signature-verified (rejects anything not signed with `STRIPE_WEBHOOK_SECRET`) and
idempotent (upsert keyed by `user_id`). Handled events:

- `checkout.session.completed` → write the new subscription (`trialing`/`active`)
- `customer.subscription.created` / `customer.subscription.updated` → sync status
- `customer.subscription.deleted` → `canceled` (access revoked)
- **`invoice.payment_failed` → `past_due` (access revoked)** — failed renewals
  drop the user below the RLS threshold at the database level.

---

## Tests (Playwright) — proof, not assumptions

```bash
npm run test:rls      # tests #1 + #2 — Supabase only, no Stripe needed
npm run test:e2e      # full suite (needs Stripe keys + `stripe listen` running)
```

All five tests live in `tests/demo.spec.ts`. Latest run: **5 passed**.

```
✅ #1 PASS — non-member sees only locked teasers in the UI
✅ #2 PASS — user-scoped HTTP read got 0 of 20 detail rows; RLS enforced at the DB
✅ #3 PASS — after checkout, member reads 20 detail rows (UI + DB)
✅ #5 PASS — trialing user has full access during trial
✅ #4 PASS — invoice.payment_failed → past_due → access revoked at DB + UI
```

| # | Test | What it proves |
| --- | --- | --- |
| 1 | Non-member blocked (UI) | Fresh signup, no subscription → no full detail rendered |
| **2** | **DB-level enforcement** | **Same user queries `listing_details` directly via a user-scoped client → Postgres returns 0 rows.** Controls confirm the data exists (service role sees it) and the client works (teasers read fine), so the 0 is RLS, not a broken query. |
| 3 | Member access | Real Stripe Checkout (test card `4242…`) → webhook flips to `trialing` → full detail visible in UI **and** readable via the user-scoped client |
| 4 | Failed payment revokes | Signature-verified `invoice.payment_failed` → `past_due` → access gone at the data layer and the UI |
| 5 | Trial works | A `trialing` user has full access during the trial |

Test #2 is the heart of the demo: it deliberately uses the **user-scoped anon
client**, never the service-role key, so a false pass by privilege escalation is
impossible.

---

## Deploy to Vercel

1. Push to a Git repo and import it into Vercel.
2. Add every variable from `.env.local` to **Vercel → Project → Settings →
   Environment Variables** (set `NEXT_PUBLIC_SITE_URL` to your Vercel URL).
   `DATABASE_URL` is only needed if you run `db:setup` against the DB; the
   running app does not use it.
3. In Stripe, create a **webhook endpoint** pointing to
   `https://YOUR-APP.vercel.app/api/stripe/webhook` for the four events above,
   and put that endpoint's signing secret into `STRIPE_WEBHOOK_SECRET` on Vercel.
4. Redeploy.

---

## Project layout

```
src/
  app/
    page.tsx                     # listings feed (teaser for all, full for members)
    login/page.tsx               # email/password auth
    auth/actions.ts              # signUp / signIn / signOut server actions
    api/stripe/checkout/route.ts # creates Checkout session (trial)
    api/stripe/webhook/route.ts  # signature-verified, idempotent; writes subscriptions
    api/stripe/portal/route.ts   # Stripe billing portal
  components/                    # SubscribeButton, ManageButton
  lib/
    supabase/client.ts           # browser client (anon + session) — RLS in force
    supabase/server.ts           # server client (anon + cookies) — RLS in force
    supabase/admin.ts            # service-role — WEBHOOK WRITES ONLY, never reads
    stripe.ts                    # lazy server-side Stripe client
  proxy.ts                       # refreshes the Supabase session per request
supabase/
  schema.sql                     # tables + RLS policies (the core deliverable)
  seed.sql                       # ~20 sample businesses-for-sale
tests/                           # Playwright suite
```

*AI involvement: this project was built with heavy use of Claude (Anthropic) for code and analysis; all results were verified by the author.*
