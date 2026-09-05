// One place for the two PostHog HTTP calls that every simulated-data runner
// makes: read each user's flags, then send the events. The Experiments page,
// the Journeys page, and the daily cron all go through here, so the cron
// cannot drift away from the pages it copies.

/** A flag value as PostHog reports it: true/false, or a variant name. */
export type FlagValue = boolean | string;

export interface PosthogTarget {
  apiKey: string;
  apiHost: string;
}

/**
 * How many flag requests are in flight at once.
 *
 * The old value of 6 came from the HTTP/1.1 six-connection limit per host.
 * PostHog serves HTTP/2, which multiplexes, so that limit does not apply. At
 * 500 users, 6 meant 84 sequential rounds.
 */
export const FLAG_FETCH_CONCURRENCY = 24;

/**
 * Events per capture request. A 500-user journey run over a long flow with 20
 * project flags builds about 16,000 events. Sending them as one POST puts the
 * whole run on one request that either works or loses everything, and it
 * builds one enormous JSON string in memory first.
 */
export const BATCH_CHUNK_SIZE = 1000;

type ProgressFn = (done: number, total: number) => void;

/**
 * Read the flag values PostHog assigns to a distinct ID.
 *
 * Accepts both response shapes. `/flags?v=2` returns
 * `{ flags: { key: { enabled, variant } } }`; the older `/decide` returns
 * `{ featureFlags: { key: value } }`.
 */
export function readFlagValues(json: unknown): Record<string, FlagValue> {
  if (!json || typeof json !== "object") return {};
  const body = json as Record<string, unknown>;

  const flags = body.flags;
  if (flags && typeof flags === "object" && !Array.isArray(flags)) {
    const result: Record<string, FlagValue> = {};
    for (const [key, raw] of Object.entries(flags as Record<string, unknown>)) {
      if (!raw || typeof raw !== "object") continue;
      const entry = raw as { enabled?: unknown; variant?: unknown };
      // A multivariate flag reports its variant name. A boolean flag reports
      // only enabled.
      result[key] = typeof entry.variant === "string" ? entry.variant : entry.enabled === true;
    }
    return result;
  }

  const legacy = body.featureFlags;
  if (legacy && typeof legacy === "object" && !Array.isArray(legacy)) {
    const result: Record<string, FlagValue> = {};
    for (const [key, value] of Object.entries(legacy as Record<string, unknown>)) {
      if (typeof value === "boolean" || typeof value === "string") result[key] = value;
    }
    return result;
  }

  return {};
}

/**
 * Ask PostHog which flags apply to each distinct ID. PostHog evaluates the
 * rollout rules against the ID, so this is the real assignment rather than
 * something the sandbox picks.
 *
 * A user whose request fails ends up with no flags rather than failing the run.
 */
export async function fetchFlagsForUsers(
  distinctIds: string[],
  target: PosthogTarget,
  onProgress?: ProgressFn
): Promise<Record<string, FlagValue>[]> {
  const url = `${normalizeHost(target.apiHost)}/flags/?v=2`;
  const results: Record<string, FlagValue>[] = distinctIds.map(() => ({}));

  for (let i = 0; i < distinctIds.length; i += FLAG_FETCH_CONCURRENCY) {
    const chunk = distinctIds.slice(i, i + FLAG_FETCH_CONCURRENCY);
    await Promise.all(
      chunk.map(async (distinctId, offset) => {
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: target.apiKey, distinct_id: distinctId, groups: {} }),
          });
          if (res.ok) results[i + offset] = readFlagValues(await res.json());
        } catch {
          // Leave this user with no flags.
        }
      })
    );
    onProgress?.(Math.min(i + FLAG_FETCH_CONCURRENCY, distinctIds.length), distinctIds.length);
    // Yield so a React progress bar can paint between chunks.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return results;
}

export class BatchSendError extends Error {
  constructor(
    message: string,
    readonly sentEvents: number,
    readonly totalEvents: number
  ) {
    super(message);
    this.name = "BatchSendError";
  }
}

/**
 * Send events to PostHog in chunks. Throws BatchSendError on the first chunk
 * that fails, and reports how many events did land, so a caller can tell a
 * partial run from a run that sent nothing.
 */
export async function sendEventBatch(
  events: Record<string, unknown>[],
  target: PosthogTarget,
  onProgress?: ProgressFn
): Promise<void> {
  const url = `${normalizeHost(target.apiHost)}/batch/`;
  let sent = 0;

  for (let i = 0; i < events.length; i += BATCH_CHUNK_SIZE) {
    const chunk = events.slice(i, i + BATCH_CHUNK_SIZE);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: target.apiKey, batch: chunk, sent_at: new Date().toISOString() }),
      });
    } catch (err) {
      throw new BatchSendError(`Network error sending events: ${(err as Error).message}`, sent, events.length);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new BatchSendError(
        `PostHog returned HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
        sent,
        events.length
      );
    }
    sent += chunk.length;
    onProgress?.(sent, events.length);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** Drop a trailing slash so `${host}/batch/` never becomes `//batch/`. */
function normalizeHost(apiHost: string): string {
  return apiHost.replace(/\/+$/, "");
}
