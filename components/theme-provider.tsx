// ============================================================
// components/theme-provider.tsx  —  wraps next-themes
// ============================================================
//
// Why does this file exist?
// next-themes exports a ThemeProvider, but it can only be used in
// a Client Component ("use client"). Our layout.tsx is a Server
// Component by default — it runs on the server and can't use
// client-side hooks or context.
//
// Solution: wrap ThemeProvider in this thin client component,
// then import *this* file in layout.tsx. Next.js will treat
// everything inside the wrapper as client-side, while the
// outer layout stays a server component.
//
// This pattern ("client boundary wrapper") is common in Next.js
// App Router whenever you need to bring a third-party client
// library into a server component tree.
"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

// We re-export it under the same name for cleaner imports.
// React.ComponentProps<typeof NextThemesProvider> gives us all
// the props the original component accepts, without having to
// duplicate the type definition.
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
