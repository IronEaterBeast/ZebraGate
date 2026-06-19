"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

let desktopLoginClient: SupabaseClient | null = null;

// Uses a dedicated, non-persisted Supabase client so signing in here never
// touches the web app's session in localStorage, keeping desktop and web
// sessions independent.
function getDesktopLoginClient(): SupabaseClient | null {
  if (desktopLoginClient) {
    return desktopLoginClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  desktopLoginClient = createClient(url, anonKey, {
    auth: { persistSession: false }
  });
  return desktopLoginClient;
}

type Mode = "sign-in" | "sign-up";
type Status = "form" | "submitting" | "linking" | "linked" | "error";

export default function DesktopLoginPage() {
  return (
    <Suspense fallback={null}>
      <DesktopLoginForm />
    </Suspense>
  );
}

function DesktopLoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callback");

  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("form");

  useEffect(() => {
    if (!callbackUrl) {
      setError("Missing callback address. Please reopen this page from ZebraGate Desktop.");
      setStatus("error");
    }
  }, [callbackUrl]);

  async function sendSessionToDesktop(
    accessToken: string,
    refreshToken: string,
    userEmail: string | null,
    userId: string,
    expiresAt: number | null
  ): Promise<void> {
    if (!callbackUrl) {
      return;
    }

    setStatus("linking");
    try {
      const response = await fetch(callbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken,
          refreshToken,
          email: userEmail,
          userId,
          expiresAt
        })
      });

      if (!response.ok) {
        throw new Error("ZebraGate Desktop did not accept the login.");
      }

      setStatus("linked");
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : "Failed to link ZebraGate Desktop.");
      setStatus("error");
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const client = getDesktopLoginClient();

    if (!client) {
      setError("Supabase is not configured.");
      return;
    }

    setStatus("submitting");
    setError(null);
    setMessage(null);

    try {
      if (mode === "sign-in") {
        const { data, error: signInError } = await client.auth.signInWithPassword({ email, password });
        if (signInError) {
          throw signInError;
        }

        const session = data.session;
        await sendSessionToDesktop(
          session.access_token,
          session.refresh_token,
          session.user.email ?? null,
          session.user.id,
          session.expires_at ?? null
        );
      } else {
        const { error: signUpError } = await client.auth.signUp({ email, password });
        if (signUpError) {
          throw signUpError;
        }
        setMessage("Check your email to confirm your account, then sign in.");
        setStatus("form");
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Authentication failed.");
      setStatus("error");
    }
  }

  if (status === "linked") {
    return (
      <main className="mx-auto max-w-md">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
          <h1 className="text-xl font-semibold">Signed in</h1>
          <p className="mt-2 text-sm text-slate-600">
            ZebraGate Desktop has been signed in. You can close this window now.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md">
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h1 className="text-xl font-semibold">{mode === "sign-in" ? "Sign In to ZebraGate Desktop" : "Sign Up"}</h1>
        <p className="mt-2 text-sm text-slate-500">
          Sign in with your ZebraGate account to link this app with ZebraGate Desktop.
        </p>
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
          {status === "linking" ? <p className="text-sm text-slate-500">Linking ZebraGate Desktop...</p> : null}
          <button
            className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            type="submit"
            disabled={status === "submitting" || status === "linking" || !callbackUrl}
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
