"use client";

import Link from "next/link";
import { useAuth } from "../lib/auth-context";

export function NavBar() {
  const { session, isLoading, signOut } = useAuth();

  return (
    <header className="mb-10 flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-center md:justify-between">
      <div>
        <Link href="/" className="text-2xl font-semibold text-ink">
          ZebraGate
        </Link>
        <p className="text-sm text-slate-500">Local AI gateway MVP scaffold</p>
      </div>
      <nav className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/download">Download</Link>
        {isLoading ? null : session ? (
          <>
            <span className="text-slate-500">{session.user.email}</span>
            <button className="text-sm underline" onClick={() => void signOut()}>
              Sign Out
            </button>
          </>
        ) : (
          <Link href="/login">Sign In</Link>
        )}
      </nav>
    </header>
  );
}
