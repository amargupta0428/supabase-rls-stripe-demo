-- ============================================================================
--  RLS-Gated Subscription Membership Demo — Database Schema
-- ----------------------------------------------------------------------------
--  Core idea: full listing detail is readable ONLY by users whose Stripe
--  subscription is `active` or `trialing`. Gating is enforced by Postgres
--  Row Level Security, NOT by application code. Even a direct API/database
--  query with the user's JWT returns zero detail rows for a non-subscriber.
--
--  Design: two tables.
--    * listings         -> public teaser (title, category, blurb). Anyone reads.
--    * listing_details   -> full data (financials, contact). RLS-gated by sub.
--    * subscriptions    -> billing state, written by Stripe webhook, read by RLS.
--
--  Run this whole file in the Supabase SQL Editor (or via `supabase db push`).
--  It is safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABLES
-- ----------------------------------------------------------------------------

create table if not exists public.listings (
  id            uuid primary key default gen_random_uuid(),
  title         text        not null,
  category      text        not null,
  location      text        not null,
  teaser        text        not null,          -- short, public preview
  price_band    text        not null,          -- rough range, e.g. "$250K–$500K"
  created_at    timestamptz not null default now()
);

create table if not exists public.listing_details (
  listing_id          uuid primary key references public.listings(id) on delete cascade,
  asking_price        integer not null,        -- exact figures = the gated value
  annual_revenue      integer not null,
  cash_flow           integer not null,
  ebitda              integer not null,
  established_year     integer not null,
  employees           integer not null,
  reason_for_selling   text    not null,
  full_description     text    not null,
  seller_contact_email text    not null
);

create table if not exists public.subscriptions (
  user_id                uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id     text unique,
  stripe_subscription_id text,
  status                 text not null default 'none',   -- active|trialing|past_due|canceled|none
  price_id               text,
  current_period_end     timestamptz,
  updated_at             timestamptz not null default now()
);

-- Fast lookup by Stripe customer id (webhook maps customer -> user).
create index if not exists subscriptions_stripe_customer_idx
  on public.subscriptions (stripe_customer_id);

-- ----------------------------------------------------------------------------
-- 2. ENABLE ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
alter table public.listings        enable row level security;
alter table public.listing_details enable row level security;
alter table public.subscriptions   enable row level security;

-- ----------------------------------------------------------------------------
-- 3. POLICIES
-- ----------------------------------------------------------------------------

-- listings (teaser): readable by anyone (anon + authenticated). No writes via API.
drop policy if exists "listings_public_read" on public.listings;
create policy "listings_public_read"
  on public.listings
  for select
  to anon, authenticated
  using (true);

-- subscriptions: a user may read ONLY their own subscription row.
-- (No insert/update/delete policy => the anon/authenticated clients can never
--  write here. Only the service-role key, used by the webhook, bypasses RLS.)
drop policy if exists "subscriptions_owner_read" on public.subscriptions;
create policy "subscriptions_owner_read"
  on public.subscriptions
  for select
  to authenticated
  using ( (select auth.uid()) = user_id );

-- listing_details (THE GATE): a row is visible ONLY if the requesting user has
-- a subscription row with status active|trialing. This EXISTS clause reads the
-- user's OWN subscription row (allowed by subscriptions_owner_read), so no
-- SECURITY DEFINER / service role is involved. Non-subscribers get 0 rows.
drop policy if exists "listing_details_subscribers_read" on public.listing_details;
create policy "listing_details_subscribers_read"
  on public.listing_details
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.subscriptions s
      where s.user_id = (select auth.uid())
        and s.status in ('active', 'trialing')
    )
  );

-- ----------------------------------------------------------------------------
-- 4. CONVENIENCE: a view some app code can use to read the caller's own status.
--    (Still RLS-protected via the underlying table.)
-- ----------------------------------------------------------------------------
create or replace view public.my_subscription
  with (security_invoker = true)
as
  select user_id, status, current_period_end, price_id
  from public.subscriptions
  where user_id = (select auth.uid());

grant select on public.my_subscription to authenticated;
