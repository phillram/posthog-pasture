"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import posthog from "posthog-js";
import { usePosthog } from "@/contexts/PosthogContext";

// Map a Next.js pathname to the page name used in evaluation_context.
// Unknown paths fall back to "unknown" rather than the raw path so we don't
// leak unrelated route fragments.
function pageNameFromPath(pathname: string): string {
  if (pathname === "/") return "setup";
  const segment = pathname.split("/").filter(Boolean)[0] ?? "unknown";
  return segment;
}

/**
 * Registers a super property `evaluation_context: pasture:<page>` on every
 * navigation so every subsequent event includes it. Rendered once at the root
 * inside PosthogProvider.
 *
 * Calls `posthog.register` directly rather than the context wrapper so we
 * don't spam the event log with a "Super Properties Registered" entry every
 * time the user changes pages.
 */
export default function PageContextTracker() {
  const pathname = usePathname();
  const { isInitialized } = usePosthog();

  useEffect(() => {
    if (!isInitialized || !pathname) return;
    const context = `pasture:${pageNameFromPath(pathname)}`;
    posthog.register({ evaluation_context: context });
  }, [pathname, isInitialized]);

  return null;
}
