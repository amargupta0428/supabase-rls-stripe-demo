export type Listing = {
  id: string;
  title: string;
  category: string;
  location: string;
  teaser: string;
  price_band: string;
  created_at: string;
};

export type ListingDetail = {
  listing_id: string;
  asking_price: number;
  annual_revenue: number;
  cash_flow: number;
  ebitda: number;
  established_year: number;
  employees: number;
  reason_for_selling: string;
  full_description: string;
  seller_contact_email: string;
};

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "none";

export type MySubscription = {
  user_id: string;
  status: SubscriptionStatus;
  current_period_end: string | null;
  price_id: string | null;
};

export const ACCESS_STATUSES: SubscriptionStatus[] = ["active", "trialing"];

export function hasAccess(status: SubscriptionStatus | null | undefined) {
  return status === "active" || status === "trialing";
}
