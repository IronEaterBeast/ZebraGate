import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "../lib/auth-context";
import { NavBar } from "../components/nav-bar";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZebraGate",
  description: "ZebraGate MVP scaffold"
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <div className="mx-auto min-h-screen max-w-6xl px-6 py-8">
            <NavBar />
            {children}
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
