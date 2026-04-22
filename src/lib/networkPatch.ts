/**
 * Intercept outbound network requests to PostHog hosts (fetch, XHR, sendBeacon)
 * so we can surface the most recent response status in the navbar.
 *
 * CRITICAL: this module must be imported *before* `posthog-js`. The SDK caches
 * `window.fetch` into a local variable at module-evaluation time, so any later
 * monkey-patch of `window.fetch` is ignored. By running this module's top-level
 * install() as a side-effect on import, we guarantee the patches are in place
 * before posthog-js captures its references.
 */

export interface LastResponse {
  status: number;
  ok: boolean;
  latencyMs: number;
  endpoint: string;
  timestamp: Date;
}

type Listener = (response: LastResponse) => void;

let latest: LastResponse | null = null;
const listeners = new Set<Listener>();
let installed = false;

function notify(response: LastResponse) {
  latest = response;
  for (const cb of listeners) {
    try {
      cb(response);
    } catch {
      // listeners must not break the network layer
    }
  }
}

export function subscribeLastResponse(cb: Listener): () => void {
  listeners.add(cb);
  // Replay the latest value so new subscribers see the current state.
  if (latest) cb(latest);
  return () => {
    listeners.delete(cb);
  };
}

export function getLastResponse(): LastResponse | null {
  return latest;
}

function isPosthogHost(url: string): boolean {
  return /(?:^|\.)(i\.posthog\.com|posthog\.com)/.test(url);
}

function pathOf(url: string): string {
  try {
    return new URL(url, typeof window !== "undefined" ? window.location.origin : "http://localhost").pathname;
  } catch {
    return url;
  }
}

function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  // ── fetch ──
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (!isPosthogHost(url)) return originalFetch(input, init);
    const start = performance.now();
    try {
      const response = await originalFetch(input, init);
      notify({
        status: response.status,
        ok: response.ok,
        latencyMs: Math.round(performance.now() - start),
        endpoint: pathOf(url),
        timestamp: new Date(),
      });
      return response;
    } catch (err) {
      notify({
        status: 0,
        ok: false,
        latencyMs: Math.round(performance.now() - start),
        endpoint: pathOf(url),
        timestamp: new Date(),
      });
      throw err;
    }
  };

  // ── XMLHttpRequest ──
  const XHRProto = window.XMLHttpRequest.prototype;
  const originalOpen = XHRProto.open;
  const originalSend = XHRProto.send;
  type TrackedXHR = XMLHttpRequest & {
    __pasture_url?: string;
    __pasture_start?: number;
  };
  XHRProto.open = function (this: TrackedXHR, ...args: unknown[]) {
    const url = args[1];
    this.__pasture_url = typeof url === "string" ? url : url instanceof URL ? url.toString() : "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return originalOpen.apply(this, args as any);
  };
  XHRProto.send = function (this: TrackedXHR, ...args: unknown[]) {
    const url = this.__pasture_url;
    if (url && isPosthogHost(url)) {
      this.__pasture_start = performance.now();
      this.addEventListener("loadend", () => {
        const latencyMs = Math.round(performance.now() - (this.__pasture_start ?? performance.now()));
        const status = this.status || 0;
        const ok = status >= 200 && status < 300;
        notify({ status, ok, latencyMs, endpoint: pathOf(url), timestamp: new Date() });
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return originalSend.apply(this, args as any);
  };

  // ── navigator.sendBeacon ──
  // Patch via the Navigator prototype (defineProperty so it works even when
  // the original property isn't writable via simple assignment).
  if (typeof Navigator !== "undefined" && typeof Navigator.prototype.sendBeacon === "function") {
    const originalSendBeacon = Navigator.prototype.sendBeacon;
    const patchedSendBeacon = function (this: Navigator, url: string | URL, data?: BodyInit | null): boolean {
      const urlString = typeof url === "string" ? url : url.toString();
      const start = performance.now();
      const queued = originalSendBeacon.call(this, url, data ?? undefined);
      if (isPosthogHost(urlString)) {
        notify({
          status: queued ? 202 : 0,
          ok: queued,
          latencyMs: Math.round(performance.now() - start),
          endpoint: pathOf(urlString),
          timestamp: new Date(),
        });
      }
      return queued;
    };
    try {
      Object.defineProperty(Navigator.prototype, "sendBeacon", {
        configurable: true,
        writable: true,
        value: patchedSendBeacon,
      });
    } catch {
      // Fall back to a direct assignment on the instance if the prototype
      // is frozen (rare). This handles older/strict environments.
      try {
        (navigator as Navigator).sendBeacon = patchedSendBeacon as Navigator["sendBeacon"];
      } catch {
        // Give up silently — the pill will just miss sendBeacon requests.
      }
    }
  }
}

// Install eagerly when this module is first imported in a browser context.
// This must happen before `posthog-js` evaluates — see note at top of file.
install();
