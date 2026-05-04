// Shared building blocks for any feature that needs to create simulated
// PostHog users (Experiments, Journeys, future ones). The point of keeping
// this in one place is that every simulated user looks the same in PostHog
// regardless of which page generated them — same username scheme, same
// profile shape, same country pool.

// ── Username generation ──────────────────────────────────────────────────────

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
  "mighty",
  "quiet",
  "plucky",
  "dapper",
  "jolly",
  "witty",
  "breezy",
  "frosty",
  "sunny",
  "dusty",
  "lazy",
  "nimble",
  "sleepy",
  "sneaky",
  "cheery",
  "prickly",
  "fluffy",
  "gentle",
  "sturdy",
  "snappy",
  "peppy",
  "hasty",
  "dizzy",
  "glossy",
  "snowy",
  "misty",
  "foggy",
  "cloudy",
  "rainy",
  "sandy",
  "rocky",
  "glassy",
  "copper",
  "bronze",
  "ruby",
  "emerald",
  "sapphire",
  "ivory",
  "onyx",
  "pearl",
  "ashen",
  "ember",
  "smoky",
  "dawn",
  "dusky",
  "twilight",
  "midnight",
  "mellow",
  "zesty",
  "spicy",
  "sour",
  "sweet",
  "salty",
  "minty",
  "lemony",
  "hazel",
  "walnut",
  "almond",
  "cedar",
  "willow",
  "oaken",
  "maple",
  "birch",
  "piney",
  "ferny",
  "lotus",
  "lilac",
  "indigo",
  "violet",
  "magenta",
  "teal",
  "charcoal",
  "ochre",
  "sepia",
  "tawny",
  "ginger",
  "regal",
  "humble",
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
  "panda",
  "koala",
  "sloth",
  "hippo",
  "rhino",
  "cheetah",
  "leopard",
  "tiger",
  "jaguar",
  "panther",
  "ocelot",
  "fox",
  "wolf",
  "coyote",
  "hyena",
  "mongoose",
  "meerkat",
  "ferret",
  "weasel",
  "beaver",
  "squirrel",
  "chipmunk",
  "hamster",
  "mole",
  "bat",
  "owl",
  "eagle",
  "hawk",
  "heron",
  "ibis",
  "stork",
  "pelican",
  "puffin",
  "albatross",
  "kiwi",
  "parrot",
  "macaw",
  "robin",
  "finch",
  "swallow",
  "magpie",
  "raven",
  "dove",
  "hummingbird",
  "kingfisher",
  "woodpecker",
  "peacock",
  "ostrich",
  "emu",
  "dolphin",
  "whale",
  "walrus",
  "seal",
  "manatee",
  "seahorse",
  "octopus",
  "squid",
  "crab",
  "lobster",
  "salamander",
  "newt",
  "frog",
  "chameleon",
  "iguana",
  "tortoise",
  "turtle",
  "cobra",
  "python",
  "mantis",
  "beetle",
  "butterfly",
  "dragonfly",
  "firefly",
  "cricket",
  "scorpion",
  "gazelle",
  "zebra",
  "giraffe",
  "kangaroo",
];

function randomFrom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** `pasture_<adj>_<noun>_<nnn>` — easy to spot in PostHog. */
export function generateUsername(index: number): string {
  const adj = randomFrom(ADJECTIVES);
  const noun = randomFrom(NOUNS);
  return `pasture_${adj}_${noun}_${String(index + 1).padStart(3, "0")}`;
}

// ── Person profile presets ───────────────────────────────────────────────────

export type ProfilePreset = "casual" | "power_user" | "enterprise";

const PROFILE_PRESET_IDS: ProfilePreset[] = ["casual", "power_user", "enterprise"];

const COUNTRIES = ["US", "GB", "DE", "FR", "JP", "AU", "CA", "BR", "IN", "ZA"];

/** Random preset — used when a feature doesn't expose a preset selector. */
export function randomProfilePreset(): ProfilePreset {
  return randomFrom(PROFILE_PRESET_IDS);
}

/**
 * Full persona for a simulated user — name, email, country, signup date,
 * plan-tier-specific fields. Use this for every simulated user so PostHog
 * sees a consistent shape across features.
 */
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

// ── Pasture protocol marker ──────────────────────────────────────────────────
// Each feature that creates simulated users tags them with a "protocol" person
// property — `pasture_experiment: true`, `pasture_journey: true`, etc. — so
// PostHog filters can pick out "users created by feature X" without rummaging
// through events. The marker is sent as a separate `$set` event appended after
// the `$identify` so the protocol is decoupled from the core profile shape.

export type PastureProtocol = "pasture_experiment" | "pasture_journey";

export function buildProtocolMarkerEvent(
  username: string,
  protocol: PastureProtocol,
  timestamp: string
): Record<string, unknown> {
  return {
    event: "$set",
    distinct_id: username,
    timestamp,
    properties: {
      $set: { [protocol]: true },
    },
  };
}
