import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";
import { SubscribeButton } from "@/components/SubscribeButton";
import { ManageButton } from "@/components/ManageButton";
import {
  hasAccess,
  type Listing,
  type ListingDetail,
  type SubscriptionStatus,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

export default async function Home() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Public teaser data — readable by anyone.
  const { data: listings } = await supabase
    .from("listings")
    .select("*")
    .order("created_at", { ascending: true });

  // GATED data. This read uses the USER-SCOPED client (anon key + session),
  // never the service role. Postgres RLS decides what comes back: full rows
  // for active/trialing subscribers, ZERO rows for everyone else.
  const { data: details } = user
    ? await supabase.from("listing_details").select("*")
    : { data: [] as ListingDetail[] };

  // The caller's own subscription status (also RLS-protected).
  const { data: sub } = user
    ? await supabase
        .from("my_subscription")
        .select("status, current_period_end")
        .maybeSingle()
    : { data: null };

  const status = (sub?.status ?? "none") as SubscriptionStatus;
  const member = hasAccess(status);

  const detailMap = new Map<string, ListingDetail>(
    (details ?? []).map((d) => [d.listing_id, d]),
  );

  const allListings = (listings ?? []) as Listing[];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-bold text-slate-900">BizListings</h1>
            <p className="text-xs text-slate-500">
              Businesses for sale · RLS-gated demo
            </p>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <span className="hidden text-sm text-slate-500 sm:inline">
                  {user.email}
                </span>
                {member ? <ManageButton /> : <SubscribeButton />}
                <form action={signOut}>
                  <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <Link
                href="/login"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                Log in
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Status banner — makes member vs non-member obvious in a walkthrough */}
      <div className="mx-auto max-w-6xl px-6 pt-6">
        {!user ? (
          <Banner
            tone="neutral"
            testid="status-anon"
            title="You're browsing as a guest"
            body="Teasers are public. Log in and subscribe to unlock full financials — access is enforced at the database level by Postgres RLS."
          />
        ) : member ? (
          <Banner
            tone="member"
            testid="status-member"
            title={`Full access ${status === "trialing" ? "(free trial)" : "(active subscription)"}`}
            body="Your subscription is active. Postgres is returning full detail rows for your session because your subscription row passes the RLS policy."
          />
        ) : (
          <Banner
            tone="locked"
            testid="status-nonmember"
            title="Limited access — not subscribed"
            body={
              status === "past_due"
                ? "Your last payment failed, so your status is past_due and access is revoked at the database level. Update billing to restore access."
                : "You're logged in but not subscribed. Postgres RLS returns ZERO full-detail rows for your session — the lock below is real, not cosmetic."
            }
          />
        )}
      </div>

      {/* Listings grid */}
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {allListings.map((l) => {
            const detail = detailMap.get(l.id);
            return (
              <article
                key={l.id}
                data-testid="listing-card"
                className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                    {l.category}
                  </span>
                  <span className="text-xs text-slate-400">{l.location}</span>
                </div>
                <h2 className="mt-2 text-base font-semibold text-slate-900">
                  {l.title}
                </h2>
                <p className="mt-1 text-sm text-slate-600">{l.teaser}</p>
                <p className="mt-2 text-sm font-medium text-slate-500">
                  Asking range: {l.price_band}
                </p>

                <div className="mt-4 border-t border-slate-100 pt-4">
                  {detail ? (
                    <FullDetail detail={detail} />
                  ) : (
                    <LockedDetail loggedIn={!!user} />
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </main>
    </div>
  );
}

function Banner({
  tone,
  title,
  body,
  testid,
}: {
  tone: "neutral" | "member" | "locked";
  title: string;
  body: string;
  testid: string;
}) {
  const styles = {
    neutral: "border-slate-200 bg-white",
    member: "border-emerald-200 bg-emerald-50",
    locked: "border-amber-200 bg-amber-50",
  }[tone];
  const titleColor = {
    neutral: "text-slate-900",
    member: "text-emerald-800",
    locked: "text-amber-800",
  }[tone];

  return (
    <div data-testid={testid} className={`rounded-xl border px-5 py-4 ${styles}`}>
      <p className={`text-sm font-semibold ${titleColor}`}>{title}</p>
      <p className="mt-0.5 text-sm text-slate-600">{body}</p>
    </div>
  );
}

function FullDetail({ detail }: { detail: ListingDetail }) {
  return (
    <div data-testid="full-detail" className="space-y-3">
      <span className="inline-block rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
        Member detail unlocked
      </span>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <Stat label="Asking price" value={usd(detail.asking_price)} />
        <Stat label="Annual revenue" value={usd(detail.annual_revenue)} />
        <Stat label="Cash flow" value={usd(detail.cash_flow)} />
        <Stat label="EBITDA" value={usd(detail.ebitda)} />
        <Stat label="Established" value={String(detail.established_year)} />
        <Stat label="Employees" value={String(detail.employees)} />
      </dl>
      <p className="text-sm text-slate-600">
        <span className="font-medium text-slate-700">Why selling: </span>
        {detail.reason_for_selling}
      </p>
      <p className="text-sm text-slate-600">{detail.full_description}</p>
      <p className="text-sm">
        <span className="font-medium text-slate-700">Seller contact: </span>
        <a
          className="text-indigo-600 underline"
          href={`mailto:${detail.seller_contact_email}`}
        >
          {detail.seller_contact_email}
        </a>
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

function LockedDetail({ loggedIn }: { loggedIn: boolean }) {
  return (
    <div data-testid="locked-detail" className="relative">
      {/* Blurred placeholder figures — purely cosmetic; the real data was
          never sent to this client because RLS withheld the rows. */}
      <div
        aria-hidden
        className="pointer-events-none select-none space-y-2 blur-sm"
      >
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Asking price</span>
          <span className="font-semibold text-slate-900">$•••,•••</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Annual revenue</span>
          <span className="font-semibold text-slate-900">$•,•••,•••</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Cash flow</span>
          <span className="font-semibold text-slate-900">$•••,•••</span>
        </div>
      </div>

      <div className="mt-3 flex flex-col items-center gap-2 rounded-lg bg-slate-50 px-4 py-4 text-center">
        <span className="text-xs font-medium text-slate-500">
          🔒 Full financials &amp; seller contact are subscriber-only
        </span>
        {loggedIn ? (
          <SubscribeButton
            label="Subscribe to unlock"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          />
        ) : (
          <Link
            href="/login"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Log in to subscribe
          </Link>
        )}
      </div>
    </div>
  );
}
