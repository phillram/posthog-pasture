"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import HedgehogGif from "@/components/HedgehogGif";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [applyFeatureFlags, setApplyFeatureFlags] = useState(false);
  const { register } = useAuth();
  const router = useRouter();

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !name || !password) return;
    register(email, name, password, applyFeatureFlags);
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <HedgehogGif index={2} size="md" className="mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-foreground mb-2">Create Account</h1>
          <p className="text-muted">Register to explore PostHog events</p>
        </div>

        <form onSubmit={handleRegister} className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Max the Hedgehog"
              className="w-full px-4 py-3 bg-input-bg border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="hedgehog@posthog.com"
              className="w-full px-4 py-3 bg-input-bg border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 bg-input-bg border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
            />
          </div>

          {/* Apply feature flags toggle */}
          <div className="flex items-start gap-3 px-3 py-3 bg-input-bg border border-border rounded-lg">
            <button
              type="button"
              onClick={() => setApplyFeatureFlags((v) => !v)}
              className={`relative mt-0.5 shrink-0 w-10 h-5 rounded-full transition-colors ${applyFeatureFlags ? "bg-warning" : "bg-muted/30"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${applyFeatureFlags ? "translate-x-5" : "translate-x-0"}`} />
            </button>
            <div>
              <p className="text-sm font-medium text-foreground">Apply feature flags on register</p>
              <p className="text-xs text-muted mt-0.5">
                When enabled, fires <code className="bg-background px-1 rounded font-mono">$feature_flag_called</code> for each flag after registration. Useful for experiment exposure tracking.
              </p>
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-primary hover:bg-primary-hover text-white font-semibold rounded-lg transition-colors"
          >
            Create Account
          </button>

          <p className="text-center text-sm text-muted mt-4">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:text-primary-hover transition-colors">
              Log in
            </Link>
          </p>
        </form>

        <Link href="/" className="block text-center text-xs text-muted mt-4 hover:text-foreground transition-colors">
          ← Back to PostHog setup
        </Link>
      </div>
    </div>
  );
}
