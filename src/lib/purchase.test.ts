import { describe, expect, it } from "vitest";
import { randomPurchaseProps } from "./purchase";

describe("randomPurchaseProps", () => {
  it("stays inside the advertised price range over many draws", () => {
    for (let i = 0; i < 2000; i++) {
      const { price } = randomPurchaseProps();
      expect(price).toBeGreaterThanOrEqual(0.01);
      expect(price).toBeLessThanOrEqual(1000);
    }
  });

  it("always emits a two-decimal price_display that matches price", () => {
    for (let i = 0; i < 500; i++) {
      const { price, price_display } = randomPurchaseProps();
      expect(price_display).toMatch(/^\d+\.\d{2}$/);
      expect(Number(price_display)).toBeCloseTo(price, 2);
    }
  });

  it("prefixes every item with hedgehog_", () => {
    for (let i = 0; i < 200; i++) {
      expect(randomPurchaseProps().item).toMatch(/^hedgehog_[a-z_]+$/);
    }
  });
});
