import { randomPurchaseProps } from "./purchase";

// ── Username generation ──────────────────────────────────────────────────────
// Same pattern as the Experiments page so simulated users are visually
// recognisable in PostHog. Lists are duplicated rather than shared to keep the
// experiments page untouched.

const ADJECTIVES = [
  "swift",
  "brave",
  "golden",
  "silver",
  "scarlet",
  "cosmic",
  "fuzzy",
  "blazing",
  "stormy",
  "crimson",
  "turbo",
  "vivid",
  "ancient",
  "electric",
  "silent",
  "bold",
  "jade",
  "rusty",
  "marble",
  "velvet",
  "neon",
  "amber",
  "cobalt",
  "mossy",
];
const NOUNS = [
  "hedgehog",
  "badger",
  "falcon",
  "rabbit",
  "otter",
  "porcupine",
  "marmot",
  "sparrow",
  "lynx",
  "wombat",
  "capybara",
  "penguin",
  "flamingo",
  "quokka",
  "axolotl",
  "narwhal",
  "platypus",
  "toucan",
  "gecko",
  "raccoon",
  "lemur",
];

export function generateUsername(index: number): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `pasture_${adj}_${noun}_${String(index + 1).padStart(3, "0")}`;
}

// ── Person profile presets ───────────────────────────────────────────────────

export type ProfilePreset = "casual" | "power_user" | "enterprise";

const COUNTRIES = ["US", "GB", "DE", "FR", "JP", "AU", "CA", "BR", "IN", "ZA"];

function randomFrom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function buildPersonProps(
  preset: ProfilePreset,
  username: string
): Record<string, unknown> {
  const country = randomFrom(COUNTRIES);
  const daysAgo = Math.floor(Math.random() * 365) + 1;
  const signupDate = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  const base = {
    name: username,
    email: `${username}@pasture.test`,
    country,
    signup_date: signupDate,
    pasture_simulated: true,
  };
  if (preset === "casual") {
    return { ...base, plan: "free", monthly_sessions: Math.floor(Math.random() * 5) + 1 };
  }
  if (preset === "power_user") {
    return { ...base, plan: "pro", monthly_sessions: Math.floor(Math.random() * 30) + 20 };
  }
  return {
    ...base,
    plan: "enterprise",
    monthly_sessions: Math.floor(Math.random() * 100) + 50,
    seats: Math.floor(Math.random() * 50) + 10,
  };
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
const FEATURES = ["charts", "reports", "exports", "dashboards", "alerts"];
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
