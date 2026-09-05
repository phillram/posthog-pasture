import { describe, expect, it } from "vitest";
import { buildVariantRates, pickControlVariant } from "./experimentRates";

describe("pickControlVariant", () => {
  it.each([
    ["prefers a variant named control", ["test", "control", "other"], "control"],
    ["treats the flag being off as the baseline", ["true", "false"], "false"],
    ["falls back to the first name in order", ["beta", "alpha"], "alpha"],
  ])("%s", (_label, variants, expected) => {
    expect(pickControlVariant(variants)).toBe(expected);
  });

  it("returns undefined when the run produced no variants", () => {
    expect(pickControlVariant([])).toBeUndefined();
  });
});

describe("buildVariantRates", () => {
  it("gives the test variant a higher rate than control", () => {
    // The regression this guards: conversion used to be drawn from one rate
    // before the variant was known, so every variant tied and PostHog could
    // never call a winner on generated data.
    const rate = buildVariantRates(["control", "test"], 20, 50);
    expect(rate("control")).toBe(20);
    expect(rate("test")).toBe(30);
  });

  it("works on a boolean flag, where off is the baseline", () => {
    const rate = buildVariantRates([true, false], 40, 25);
    expect(rate("false")).toBe(40);
    expect(rate("true")).toBe(50);
  });

  it("separates several test variants instead of tying them", () => {
    const rate = buildVariantRates(["control", "a", "b"], 20, 100);
    expect(rate("control")).toBe(20);
    expect(rate("a")).toBeLessThan(rate("b"));
    expect(rate("b")).toBe(40);
  });

  it("gives every variant the baseline when the lift is zero", () => {
    const rate = buildVariantRates(["control", "test"], 30, 0);
    expect(rate("control")).toBe(30);
    expect(rate("test")).toBe(30);
  });

  it("lets a test variant lose", () => {
    const rate = buildVariantRates(["control", "test"], 40, -50);
    expect(rate("test")).toBe(20);
  });

  it.each([
    ["above 100", 80, 500],
    ["below 0", 20, -500],
  ])("clamps a rate that would land %s", (_label, baseline, lift) => {
    const rate = buildVariantRates(["control", "test"], baseline, lift);
    expect(rate("test")).toBeGreaterThanOrEqual(0);
    expect(rate("test")).toBeLessThanOrEqual(100);
  });

  it("falls back to the baseline for a variant it never saw", () => {
    expect(buildVariantRates(["control"], 15, 50)("surprise")).toBe(15);
  });
});
