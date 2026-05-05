// ============================================================
// components/theme-toggle.tsx  —  light / dark mode button
// ============================================================
//
// Clicking this button switches between light and dark mode.
// It reads and sets the theme via next-themes' useTheme hook,
// which updates a "dark" class on the <html> element.
// Tailwind's dark: variant reads that class to apply dark styles.
//
// Must be "use client" because useTheme uses React context, which
// is only available in the browser, not during server rendering.
"use client";

// Lucide icons — Sun for light mode, Moon for dark mode.
// We show both in the DOM but use CSS transforms to hide/show
// the right one depending on the current theme.
import { Moon, Sun } from "lucide-react";

// useTheme from next-themes gives us:
//   theme     — current theme string ("light" | "dark" | "system")
//   setTheme  — function to change the theme
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"   // no background by default, only on hover
      size="icon"       // square button sized for a single icon
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label="Toggle theme"
    >
      {/*
        Sun icon:
          • In light mode: visible (scale-100, rotate-0)
          • In dark mode:  hidden  (scale-0, -rotate-90)
        The transition- class animates between the two states.
      */}
      <Sun className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />

      {/*
        Moon icon:
          • In light mode: hidden  (scale-0, rotate-90)
          • In dark mode:  visible (scale-100, rotate-0)
        `absolute` stacks it on top of the Sun so they share the same space.
      */}
      <Moon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </Button>
  );
}
