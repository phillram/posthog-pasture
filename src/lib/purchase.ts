// 25 hedgehog-themed merchandise items. Every pasture_purchase event generated
// by Pasture picks one at random and prefixes it with "hedgehog_".
export const MERCHANDISE_ITEMS = [
  "plushie",
  "mug",
  "sticker_pack",
  "t_shirt",
  "hoodie",
  "keychain",
  "poster",
  "enamel_pin",
  "tote_bag",
  "notebook",
  "water_bottle",
  "beanie",
  "socks",
  "coaster_set",
  "lanyard",
  "backpack",
  "figurine",
  "phone_case",
  "laptop_sleeve",
  "pajamas",
  "baseball_cap",
  "sweatshirt",
  "umbrella",
  "bookmark",
  "blanket",
] as const;

export interface PurchaseProps {
  item: string;
  price: number;
  price_display: string;
  currency: "USD";
}

function randomItem(): string {
  const i = Math.floor(Math.random() * MERCHANDISE_ITEMS.length);
  return `hedgehog_${MERCHANDISE_ITEMS[i]}`;
}

function randomCents(): number {
  // Integer cents from 1..100000 → $0.01 inclusive through $1000.00 inclusive.
  return Math.floor(Math.random() * 100_000) + 1;
}

/**
 * Generate randomized props for a `pasture_purchase` event.
 * Item is `hedgehog_<one of 25>`, price is $0.01 – $1000.00.
 * Both `price` (number, for aggregation) and `price_display` (string, always
 * xx.yy so trailing zeros are preserved) are included.
 */
export function randomPurchaseProps(): PurchaseProps {
  const cents = randomCents();
  const price = cents / 100;
  return {
    item: randomItem(),
    price,
    price_display: price.toFixed(2),
    currency: "USD",
  };
}
