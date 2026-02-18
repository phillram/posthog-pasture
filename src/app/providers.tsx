"use client";

import { PosthogProvider } from "@/contexts/PosthogContext";
import { AuthProvider } from "@/contexts/AuthContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PosthogProvider>
      <AuthProvider>{children}</AuthProvider>
    </PosthogProvider>
  );
}
