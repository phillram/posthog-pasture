"use client";

import { PosthogProvider } from "@/contexts/PosthogContext";
import { AuthProvider } from "@/contexts/AuthContext";
import PageContextTracker from "@/components/PageContextTracker";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PosthogProvider>
      <PageContextTracker />
      <AuthProvider>{children}</AuthProvider>
    </PosthogProvider>
  );
}
