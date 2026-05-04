import { randomPurchaseProps } from "./purchase";

// User generation, person presets, and the protocol marker live in
// `simulatedUsers.ts` and are shared with the Experiments page.
export {
  generateUsername,
  buildPersonProps,
  randomProfilePreset,
  type ProfilePreset,
} from "./simulatedUsers";

function randomFrom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Step + Flow types ────────────────────────────────────────────────────────

export interface JourneyStep {
  /** PostHog event name. Custom events are prefixed `pasture_`. */
  event: string;
  /** Static properties for this step. Dynamic properties (e.g. random
   *  purchase amount) are produced via `dynamicProps`. */
  props?: Record<string, unknown>;
  /** Per-user runtime property generator. Result is merged over `props`. */
  dynamicProps?: () => Record<string, unknown>;
}

export interface Flow {
  id: string;
  label: string;
  emoji: string;
  description: string;
  /** Ordered events fired for each user that runs this flow. */
  steps: JourneyStep[];
}

// ── Catalog helpers ──────────────────────────────────────────────────────────

const PRODUCT_CATEGORIES = ["plushies", "apparel", "accessories", "stationery", "drinkware"];
const SEARCH_QUERIES = [
  "hedgehog plushie",
  "limited edition mug",
  "sticker pack",
  "hoodie size large",
  "gift ideas",
  "new arrivals",
  "discount codes",
  "shipping policy",
];
const SUPPORT_SUBJECTS = ["Order not received", "Refund request", "Account access", "Bug report"];

function productProps(): Record<string, unknown> {
  const merch = randomPurchaseProps();
  return {
    sku: merch.item,
    category: randomFrom(PRODUCT_CATEGORIES),
    price: merch.price,
  };
}

function pageview(path: string): JourneyStep {
  return {
    event: "$pageview",
    props: {
      $current_url: `https://pasture.test${path}`,
      $pathname: path,
      pasture_route: path,
    },
  };
}

// ── Flow catalog ─────────────────────────────────────────────────────────────

export const FLOWS: Flow[] = [
  {
    id: "shopper",
    label: "Shopper",
    emoji: "🛒",
    description: "Browses products and completes a purchase.",
    steps: [
      { event: "pasture_user_logged_in", props: { method: "email" } },
      pageview("/"),
      pageview("/products"),
      { event: "pasture_product_viewed", dynamicProps: productProps },
      { event: "pasture_add_to_cart", dynamicProps: () => ({ ...productProps(), qty: 1 }) },
      pageview("/checkout"),
      { event: "pasture_checkout_started", dynamicProps: () => ({ cart_value: randomPurchaseProps().price }) },
      { event: "pasture_purchase", dynamicProps: () => randomPurchaseProps() },
      { event: "pasture_user_logged_out" },
    ],
  },
  {
    id: "window_shopper",
    label: "Window Shopper",
    emoji: "🪟",
    description: "Looks around but never buys.",
    steps: [
      { event: "pasture_user_logged_in", props: { method: "email" } },
      pageview("/"),
      pageview("/products"),
      { event: "pasture_product_viewed", dynamicProps: productProps },
      { event: "pasture_product_viewed", dynamicProps: productProps },
      { event: "pasture_product_viewed", dynamicProps: productProps },
      { event: "pasture_user_logged_out" },
    ],
  },
  {
    id: "new_signup",
    label: "New Signup",
    emoji: "✨",
    description: "First-time visitor registers and lands on the dashboard.",
    steps: [
      pageview("/"),
      pageview("/register"),
      { event: "pasture_form_submitted", props: { form_name: "register" } },
      { event: "pasture_signup", props: { source: "organic" } },
      { event: "pasture_user_logged_in", props: { method: "registration" } },
      pageview("/dashboard"),
      { event: "pasture_user_logged_out" },
    ],
  },
  {
    id: "search_and_browse",
    label: "Search & Browse",
    emoji: "🔍",
    description: "Searches the catalogue and clicks results.",
    steps: [
      { event: "pasture_user_logged_in", props: { method: "email" } },
      pageview("/"),
      { event: "pasture_search_performed", dynamicProps: () => ({ query: randomFrom(SEARCH_QUERIES) }) },
      pageview("/search"),
      { event: "pasture_product_viewed", dynamicProps: productProps },
      { event: "pasture_product_viewed", dynamicProps: productProps },
      { event: "pasture_user_logged_out" },
    ],
  },
  {
    id: "checkout_abandon",
    label: "Checkout Abandon",
    emoji: "🛑",
    description: "Adds to cart, starts checkout, then leaves.",
    steps: [
      { event: "pasture_user_logged_in", props: { method: "email" } },
      pageview("/products"),
      { event: "pasture_product_viewed", dynamicProps: productProps },
      { event: "pasture_add_to_cart", dynamicProps: () => ({ ...productProps(), qty: 1 }) },
      pageview("/cart"),
      { event: "pasture_checkout_started", dynamicProps: () => ({ cart_value: randomPurchaseProps().price }) },
      { event: "pasture_user_logged_out" },
    ],
  },
  {
    id: "feature_explorer",
    label: "Feature Explorer",
    emoji: "🧭",
    description: "Pokes around the dashboard's features.",
    steps: [
      { event: "pasture_user_logged_in", props: { method: "email" } },
      pageview("/dashboard"),
      { event: "pasture_feature_used", props: { feature: "charts" } },
      { event: "pasture_feature_used", props: { feature: "reports" } },
      { event: "pasture_feature_used", props: { feature: "exports" } },
      pageview("/settings"),
      { event: "pasture_user_logged_out" },
    ],
  },
  {
    id: "support_ticket",
    label: "Support Ticket",
    emoji: "🎟️",
    description: "Visits help, searches, files a ticket.",
    steps: [
      { event: "pasture_user_logged_in", props: { method: "email" } },
      pageview("/help"),
      { event: "pasture_search_performed", dynamicProps: () => ({ query: randomFrom(SEARCH_QUERIES) }) },
      {
        event: "pasture_form_submitted",
        dynamicProps: () => ({ form_name: "support", subject: randomFrom(SUPPORT_SUBJECTS) }),
      },
      { event: "pasture_user_logged_out" },
    ],
  },
  {
    id: "power_user",
    label: "Power User",
    emoji: "⚡",
    description: "Heavy session: explores features and makes a purchase.",
    steps: [
      { event: "pasture_user_logged_in", props: { method: "email" } },
      pageview("/dashboard"),
      { event: "pasture_feature_used", props: { feature: "charts" } },
      { event: "pasture_feature_used", props: { feature: "dashboards" } },
      pageview("/products"),
      { event: "pasture_product_viewed", dynamicProps: productProps },
      { event: "pasture_add_to_cart", dynamicProps: () => ({ ...productProps(), qty: 1 }) },
      pageview("/checkout"),
      { event: "pasture_purchase", dynamicProps: () => randomPurchaseProps() },
      { event: "pasture_feature_used", props: { feature: "reports" } },
      { event: "pasture_user_logged_out" },
    ],
  },
];

export function findFlow(id: string): Flow | undefined {
  return FLOWS.find((f) => f.id === id);
}

/**
 * Average step count across the chosen flows. Used by the configure step's
 * "≈ N events will be sent" estimator. Includes the flow's own steps plus
 * `$identify` and (estimated) one `$feature_flag_called`.
 */
export function avgEventsPerUser(selectedFlowIds: string[], flagsCount: number): number {
  if (selectedFlowIds.length === 0) return 0;
  const stepsAvg =
    selectedFlowIds.reduce((sum, id) => sum + (findFlow(id)?.steps.length ?? 0), 0) /
    selectedFlowIds.length;
  // +1 for $identify, +flagsCount for $feature_flag_called per flag (or 0).
  return Math.round(stepsAvg + 1 + flagsCount);
}
