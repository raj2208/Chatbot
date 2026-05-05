// ============================================================
// app/layout.tsx  —  the root layout (server component)
// ============================================================
//
// In Next.js App Router every route is wrapped in layout files.
// This is the outermost one — it wraps every page in the app.
// It renders the <html> and <body> tags that all pages share.
//
// Key things that go here:
//   • global fonts
//   • global CSS
//   • providers that need to wrap the whole app (themes, auth, etc.)
//   • shared metadata (browser tab title, description for SEO)
//
// This file has NO "use client" directive, so it's a Server Component.
// It runs on the server — no browser APIs, no useState, no hooks.

import type { Metadata } from "next";

// next/font/google downloads and self-hosts Google Fonts at build time.
// No external requests at runtime — faster and more private than a CDN.
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css"; // global styles (Tailwind + CSS variables)

// ThemeProvider is our thin client wrapper around next-themes.
// It must wrap all children so useTheme() works anywhere in the tree.
import { ThemeProvider } from "@/components/theme-provider";

// ── Font setup ────────────────────────────────────────────────
// Each call returns an object with a `variable` property — a CSS
// custom property name like "--font-geist-sans". We apply it to
// <html> so the variable is available everywhere via Tailwind's
// font-sans / font-mono utilities (configured in globals.css).
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"], // only download the Latin character set
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// ── Metadata ─────────────────────────────────────────────────
// Next.js reads this and injects the right <title> and <meta> tags.
// Each page can export its own metadata that overrides these defaults.
export const metadata: Metadata = {
  title: "Chatbot",
  description: "AI chatbot powered by Gemini",
};

// ── Root layout component ─────────────────────────────────────
// `children` is whatever page (or nested layout) Next.js is rendering.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning is required by next-themes.
    // next-themes adds a class to <html> on the client to set the theme,
    // which differs from the server-rendered HTML (which has no theme class).
    // This prop silences React's hydration mismatch warning for that one tag.
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen antialiased">
        {/*
          ThemeProvider configuration:
            attribute="class"     → next-themes adds/removes a "dark" class
                                    on <html>, which Tailwind's dark: variant reads
            defaultTheme="system" → respect the OS-level light/dark preference
            enableSystem          → required for "system" to work
            disableTransitionOnChange → prevents a flash of unstyled content
                                        when the theme changes on first load
        */}
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
