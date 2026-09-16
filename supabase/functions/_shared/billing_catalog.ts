export type CheckoutKind = "pro" | "topup_small" | "topup_large";

export const CHECKOUT_CREDITS: Readonly<Record<CheckoutKind, number>> = {
  pro: 600,
  topup_small: 600,
  topup_large: 3000,
};

export type StripeCatalog = Readonly<Record<CheckoutKind, string>>;

const PRICE_ID = /^price_[A-Za-z0-9_]{6,200}$/;

export function checkoutKind(value: unknown): CheckoutKind | null {
  return value === "pro" || value === "topup_small" || value === "topup_large"
    ? value
    : null;
}
export function stripeCatalogFromEnv(): StripeCatalog {
  const catalog: StripeCatalog = {
    pro: Deno.env.get("STRIPE_PRICE_PRO")?.trim() ?? "",
    topup_small: Deno.env.get("STRIPE_PRICE_TOPUP_SMALL")?.trim() ?? "",
    topup_large: Deno.env.get("STRIPE_PRICE_TOPUP_LARGE")?.trim() ?? "",
  };
  const ids = Object.values(catalog);
  if (
    ids.some((id) => !PRICE_ID.test(id)) || new Set(ids).size !== ids.length
  ) {
    throw new Error("Stripe price catalog is missing, invalid, or duplicated");
  }
  return catalog;
}

export function stripeLivemode(stripeKey: string): boolean {
  const explicit = Deno.env.get("STRIPE_LIVEMODE")?.trim().toLowerCase();
  const inferred = stripeKey.startsWith("sk_live_")
    ? true
    : stripeKey.startsWith("sk_test_")
    ? false
    : null;
  if (inferred !== null) {
    if (
      ["true", "false"].includes(explicit ?? "") &&
      (explicit === "true") !== inferred
    ) {
      throw new Error("Stripe mode configuration contradicts the key");
    }
    return inferred;
  }
  if (explicit === "true") return true;
  if (explicit === "false") return false;
  throw new Error("Stripe mode must be configured for this key type");
}
