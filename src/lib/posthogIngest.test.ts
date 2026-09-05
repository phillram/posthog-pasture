import { afterEach, describe, expect, it, vi } from "vitest";
import { BATCH_CHUNK_SIZE, BatchSendError, readFlagValues, sendEventBatch } from "./posthogIngest";

const TARGET = { apiKey: "phc_test", apiHost: "https://us.i.posthog.com" };

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(handler: (url: string, init: RequestInit) => Response): { calls: RequestInit[] } {
  const calls: RequestInit[] = [];
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    calls.push(init);
    return Promise.resolve(handler(url, init));
  });
  return { calls };
}

function bodyOf(init: RequestInit): { batch: unknown[] } {
  return JSON.parse(init.body as string);
}

describe("readFlagValues", () => {
  it("reads the /flags?v=2 shape", () => {
    // posthog-js moved to /flags?v=2, which nests enabled and variant under
    // each key instead of returning a flat map.
    expect(
      readFlagValues({
        flags: {
          "bool-on": { enabled: true },
          "bool-off": { enabled: false },
          multivariate: { enabled: true, variant: "test" },
        },
      })
    ).toEqual({ "bool-on": true, "bool-off": false, multivariate: "test" });
  });

  it("still reads the older flat featureFlags shape", () => {
    expect(readFlagValues({ featureFlags: { a: true, b: "control" } })).toEqual({ a: true, b: "control" });
  });

  it.each([
    ["null", null],
    ["a string", "nope"],
    ["an empty object", {}],
    ["an array under flags", { flags: [] }],
  ])("returns nothing for %s instead of throwing", (_label, input) => {
    expect(readFlagValues(input)).toEqual({});
  });
});

describe("sendEventBatch", () => {
  it("splits a large run across several requests", async () => {
    // 500 users over a long flow with 20 flags builds about 16,000 events. One
    // request risks the whole run on a single response.
    const { calls } = stubFetch(() => new Response("ok", { status: 200 }));
    const events = Array.from({ length: BATCH_CHUNK_SIZE * 2 + 5 }, (_, i) => ({ event: `e${i}` }));

    await sendEventBatch(events, TARGET);

    expect(calls).toHaveLength(3);
    expect(bodyOf(calls[0]).batch).toHaveLength(BATCH_CHUNK_SIZE);
    expect(bodyOf(calls[2]).batch).toHaveLength(5);
  });

  it("sends one request when the run is small", async () => {
    const { calls } = stubFetch(() => new Response("ok", { status: 200 }));
    await sendEventBatch([{ event: "a" }, { event: "b" }], TARGET);
    expect(calls).toHaveLength(1);
  });

  it("reports how many events landed before a chunk failed", async () => {
    let call = 0;
    stubFetch(() => (++call === 2 ? new Response("nope", { status: 413 }) : new Response("ok", { status: 200 })));
    const events = Array.from({ length: BATCH_CHUNK_SIZE * 2 }, (_, i) => ({ event: `e${i}` }));

    const failure = await sendEventBatch(events, TARGET).catch((err: BatchSendError) => err);

    expect(failure).toBeInstanceOf(BatchSendError);
    expect((failure as BatchSendError).sentEvents).toBe(BATCH_CHUNK_SIZE);
    expect((failure as BatchSendError).totalEvents).toBe(BATCH_CHUNK_SIZE * 2);
  });

  it("does not double the slash when the host has a trailing one", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", (url: string) => {
      urls.push(url);
      return Promise.resolve(new Response("ok", { status: 200 }));
    });

    await sendEventBatch([{ event: "a" }], { ...TARGET, apiHost: "https://proxy.example.com/" });

    expect(urls[0]).toBe("https://proxy.example.com/batch/");
  });
});
