"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase-browser";

type Mode = "sign-in" | "sign-up";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const client = getSupabaseBrowserClient();

    if (!client) {
      setError("Supabase is not configured.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      if (mode === "sign-in") {
        const { error: signInError } = await client.auth.signInWithPassword({ email, password });
        if (signInError) {
          throw signInError;
        }
        router.push("/dashboard");
      } else {
        const { error: signUpError } = await client.auth.signUp({ email, password });
        if (signUpError) {
          throw signUpError;
        }
        setMessage("Check your email to confirm your account, then sign in.");
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Authentication failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-md">
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h1 className="text-xl font-semibold">{mode === "sign-in" ? "Sign In" : "Sign Up"}</h1>
        <form className="mt-4 grid gap-4" onSubmit={(event) => void handleSubmit(event)}>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600">Email</span>
            <input
              className="rounded-xl border border-slate-300 px-3 py-2"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600">Password</span>
            <input
              className="rounded-xl border border-slate-300 px-3 py-2"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? <p className="text-sm text-rose-700">{error}</p> : null}
          {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
          <button
            className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            type="submit"
            disabled={isSubmitting}
          >
            {mode === "sign-in" ? "Sign In" : "Sign Up"}
          </button>
        </form>
        <button
          className="mt-4 text-sm text-slate-500 underline"
          onClick={() => {
            setMode(mode === "sign-in" ? "sign-up" : "sign-in");
            setError(null);
            setMessage(null);
          }}
        >
          {mode === "sign-in" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}
