"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import HedgehogGif from "@/components/HedgehogGif";

export default function LoginPage() {
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login, loginAsGuest } = useAuth();
  const router = useRouter();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameOrEmail || !password) return;
    setError("");
    const success = login(usernameOrEmail, password);
    if (success) {
      router.push("/dashboard");
    } else {
      setError("Invalid password. Hint: the password is \"test\"");
    }
  };

  const handleGuest = () => {
    loginAsGuest();
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <HedgehogGif index={1} size="md" className="mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-foreground mb-2">Welcome Back</h1>
          <p className="text-muted">Log in to start sending PostHog events</p>
        </div>

        <form onSubmit={handleLogin} className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Username or Email</label>
            <input
              type="text"
              value={usernameOrEmail}
              onChange={(e) => setUsernameOrEmail(e.target.value)}
              placeholder="hedgehog or hedgehog@posthog.com"
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
            <div className="mt-2 px-3 py-2 bg-primary/10 border border-primary/20 rounded-lg">
              <p className="text-xs text-primary">
                No registration needed! Enter any username and password <code className="bg-input-bg px-1.5 py-0.5 rounded text-primary font-mono font-bold">test</code> to log in instantly.
              </p>
            </div>
          </div>

          {error && (
            <p className="text-error text-sm">{error}</p>
          )}

          <button
            type="submit"
            className="w-full py-3 bg-primary hover:bg-primary-hover text-white font-semibold rounded-lg transition-colors"
          >
            Log In
          </button>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 bg-card text-muted">or</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGuest}
            className="w-full py-3 bg-accent hover:bg-accent-hover text-white font-semibold rounded-lg transition-colors"
          >
            Continue as Guest
          </button>

          <p className="text-center text-sm text-muted mt-4">
            Want to set person properties on sign up?{" "}
            <Link href="/register" className="text-primary hover:text-primary-hover transition-colors">
              Register instead
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
