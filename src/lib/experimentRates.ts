// Per-variant conversion rates for the Experiments page.
//
// The page used to draw one conversion outcome per user from a single rate,
// before it knew the user's variant. Every variant then converted at the same
// rate by construction, and the "Variant breakdown" could only ever differ by
// sampling noise. No generated experiment could show a winner, which is most of
// what a person comes to the Experiments page to see.

/** How PostHog reports a variant: a name, or true/false for a boolean flag. */
export type VariantLabel = string;

/**
 * Pick the control variant out of the ones PostHog handed back.
 *
 * PostHog names the baseline "control" on an experiment flag. A plain boolean
 * flag has no name, so the users with the flag off are the baseline. Anything
 * else falls back to the first variant in alphabetical order, which keeps the
 * choice stable across runs.
 */
export function pickControlVariant(variants: VariantLabel[]): VariantLabel | undefined {
  const unique = [...new Set(variants)].sort();
  if (unique.length === 0) return undefined;
  if (unique.includes("control")) return "control";
  if (unique.includes("false")) return "false";
  return unique[0];
}

/**
 * Build a lookup from variant to conversion rate, as a percentage.
 *
 * The control variant keeps `baselinePct`. Each other variant gets a share of
 * `liftPct` on top. One test variant takes the whole lift. Several test
 * variants take a rising share each, so an A/B/n run separates them instead of
 * ending in a tie.
 *
 * @param variants   The variant of every user in the run, in any order.
 * @param baselinePct Conversion rate of the control variant, 0 to 100.
 * @param liftPct    Relative lift for the top test variant, as a percentage.
 *                   0 gives every variant the baseline rate. Negative values
 *                   make the test variants lose, which is worth testing too.
 */
export function buildVariantRates(
  variants: (string | boolean)[],
  baselinePct: number,
  liftPct: number
): (variant: VariantLabel) => number {
  const labels = variants.map(String);
  const control = pickControlVariant(labels);
  const testVariants = [...new Set(labels)].sort().filter((v) => v !== control);

  const rates = new Map<VariantLabel, number>();
  if (control !== undefined) rates.set(control, clampPct(baselinePct));
  testVariants.forEach((variant, index) => {
    const share = testVariants.length === 1 ? 1 : (index + 1) / testVariants.length;
    rates.set(variant, clampPct(baselinePct * (1 + (liftPct * share) / 100)));
  });

  return (variant) => rates.get(variant) ?? clampPct(baselinePct);
}

function clampPct(value: number): number {
  return Math.min(100, Math.max(0, value));
}
