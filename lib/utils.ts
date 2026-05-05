// ============================================================
// lib/utils.ts  —  shared utility helpers
// ============================================================
//
// This file is the standard shadcn/ui utility module.
// It exports `cn`, a tiny but very useful function for building
// Tailwind class strings conditionally.

// clsx — lets you write conditional class logic cleanly:
//   clsx("base", isActive && "active", { hidden: !show })
//   → "base active"  (if isActive=true, show=true)
//
// ClassValue is the TypeScript type for anything clsx accepts:
// strings, objects, arrays, undefined, booleans.
import { clsx, type ClassValue } from "clsx";

// tailwind-merge — resolves Tailwind conflicts intelligently.
// Without it, merging "p-2" and "p-4" gives "p-2 p-4" which is
// ambiguous (last one wins in CSS, but it's fragile).
// twMerge("p-2", "p-4") → "p-4"  ✓
import { twMerge } from "tailwind-merge";

// ── cn() ──────────────────────────────────────────────────────
// Combines clsx (conditional classes) + twMerge (conflict resolution).
// Usage everywhere in the UI:
//
//   cn("rounded px-4", isActive && "bg-blue-500", className)
//
// The `...inputs: ClassValue[]` spread means you can pass any number
// of arguments — strings, objects, arrays — and they all get merged.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
