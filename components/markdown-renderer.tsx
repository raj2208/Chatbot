// ============================================================
// components/markdown-renderer.tsx  —  renders markdown safely
// ============================================================
//
// The LLM returns plain text strings that contain Markdown syntax:
//   **bold**, `code`, ## headings, - lists, ```code blocks```, etc.
//
// Without this component, all of that renders as raw characters in
// a <span> — the user sees "**bold**" instead of bold text.
//
// This component uses react-markdown to parse the Markdown AST
// (Abstract Syntax Tree) and replace each node type with a styled
// React element. We get to control exactly how every element looks.
//
// Libraries used:
//   react-markdown   — parses Markdown and renders React elements
//   remark-gfm       — adds GitHub Flavored Markdown support:
//                      tables, strikethrough ~~text~~, task lists [ ]
//   rehype-highlight — walks the AST and adds highlight.js class
//                      names to code blocks for syntax colouring
//
// CSS:
//   We import highlight.js themes at the bottom of globals.css.
//   The light theme is active by default; the dark theme activates
//   when the <html> element has the "dark" class (set by next-themes).

"use client";

// ── Highlight.js light theme ──────────────────────────────────
// Imported here (not in globals.css) because Tailwind v4's PostCSS
// pipeline can't resolve node_modules @imports. Next.js's bundler
// handles CSS imports from component files just fine.
// The dark theme overrides live in app/globals.css as plain CSS rules
// (no @import needed there — they're just .dark .hljs-* selectors).
import "highlight.js/styles/github.css";

// ReactMarkdown is the core component. It accepts a string of Markdown
// and renders a tree of React elements.
import ReactMarkdown, { type Components } from "react-markdown";

// remark-gfm extends the Markdown parser with GitHub extras.
// Without it, pipe tables and ~~strikethrough~~ are treated as plain text.
import remarkGfm from "remark-gfm";

// rehype-highlight runs after parsing and adds .hljs-* class names to
// the <code> nodes inside ``` fenced code blocks. Those classes are
// then styled by the highlight.js CSS we import in globals.css.
import rehypeHighlight from "rehype-highlight";

import { cn } from "@/lib/utils";

// ── Custom component map ─────────────────────────────────────
// react-markdown lets you override any HTML element it would normally
// render. The keys match HTML tag names. Each value is a React
// component that receives all the props that element would normally get.
//
// We do this instead of using @tailwindcss/typography (the "prose" plugin)
// because it gives us precise control over every element, and it works
// reliably with Tailwind v4 without extra plugin configuration.
const components: Components = {

  // ── Paragraphs ───────────────────────────────────────────
  // leading-7: generous line height for readable paragraphs
  // [&:not(:first-child)]: top margin only when not the first element
  p: ({ children }) => (
    <p className="leading-7 [&:not(:first-child)]:mt-4">{children}</p>
  ),

  // ── Headings ────────────────────────────────────────────
  // Gemini often uses ## and ### to structure long answers.
  h1: ({ children }) => (
    <h1 className="mt-6 mb-2 text-xl font-bold tracking-tight">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-5 mb-2 text-lg font-semibold tracking-tight border-b border-border pb-1">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-4 mb-1.5 text-base font-semibold">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mt-3 mb-1 text-sm font-semibold">{children}</h4>
  ),

  // ── Lists ────────────────────────────────────────────────
  ul: ({ children }) => (
    // list-disc adds the bullet points; pl-6 indents the items
    <ul className="mt-3 list-disc pl-6 space-y-1.5">{children}</ul>
  ),
  ol: ({ children }) => (
    // list-decimal adds numbers
    <ol className="mt-3 list-decimal pl-6 space-y-1.5">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="leading-7">{children}</li>
  ),

  // ── Blockquote ───────────────────────────────────────────
  // Used by Gemini for callouts, caveats, or quoted text.
  // The left border + muted background gives a clear visual treatment.
  blockquote: ({ children }) => (
    <blockquote className="mt-4 border-l-4 border-border pl-4 italic text-muted-foreground">
      {children}
    </blockquote>
  ),

  // ── Horizontal rule ─────────────────────────────────────
  // Gemini uses "---" to separate sections in long answers.
  hr: () => (
    <hr className="my-5 border-border" />
  ),

  // ── Links ────────────────────────────────────────────────
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer" // security: prevents the new tab from accessing window.opener
      className="font-medium underline underline-offset-4 text-primary hover:opacity-80 transition-opacity"
    >
      {children}
    </a>
  ),

  // ── Strong / emphasis ────────────────────────────────────
  strong: ({ children }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic">{children}</em>
  ),

  // ── Inline code ─────────────────────────────────────────
  // `like this` in Markdown.
  // We detect inline vs block by checking if there's no parent <pre>.
  // The `node` prop gives us access to the raw AST node.
  code: ({ className, children, ...props }) => {
    // When rehype-highlight processes a fenced code block, it wraps
    // it in <pre><code className="language-xxx hljs">...</code></pre>.
    // The `language-` class tells us this is a block, not inline code.
    const isBlock = className?.includes("language-") || className?.includes("hljs");

    if (isBlock) {
      // Block code: let the <pre> wrapper handle styling.
      // Just pass the className through so highlight.js styles apply.
      return (
        <code className={cn("text-sm", className)} {...props}>
          {children}
        </code>
      );
    }

    // Inline code: pill-shaped background, monospace font.
    return (
      <code
        className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.85em] font-medium"
        {...props}
      >
        {children}
      </code>
    );
  },

  // ── Code block wrapper (<pre>) ───────────────────────────
  // rehype-highlight puts syntax-highlighted <code> inside a <pre>.
  //
  // Important: do NOT set text colour or background here.
  // highlight.js/styles/github.css sets .hljs { background: #f6f8fa; color: #24292e }
  // for light mode, and our globals.css overrides .dark .hljs { background: #0d1117 }
  // for dark mode. If we hardcode bg/text on <pre> it fights with those rules —
  // e.g. white text (text-zinc-100) on the github.css white background = invisible.
  //
  // We only control shape, spacing, and overflow here. highlight.js owns the colours.
  pre: ({ children }) => (
    <pre className="mt-4 mb-2 overflow-x-auto rounded-xl text-sm [&>.hljs]:rounded-xl [&>.hljs]:p-4">
      {children}
    </pre>
  ),

  // ── Tables (GFM) ─────────────────────────────────────────
  // Requires remark-gfm. Gemini uses tables for comparisons and specs.
  table: ({ children }) => (
    // overflow-x-auto makes wide tables scroll horizontally on mobile.
    <div className="mt-4 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-muted text-muted-foreground">{children}</thead>
  ),
  tbody: ({ children }) => (
    // divide-y adds a thin border between rows
    <tbody className="divide-y divide-border">{children}</tbody>
  ),
  tr: ({ children }) => (
    <tr className="transition-colors hover:bg-muted/50">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="px-4 py-2.5 text-left font-semibold text-xs uppercase tracking-wide">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-4 py-2.5">{children}</td>
  ),
};

// ── MarkdownRenderer component ────────────────────────────────
// Props:
//   content — the raw Markdown string from the LLM
//   className — optional extra classes for the wrapper div
interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    // The wrapper div is "text-inherit" so it picks up whatever
    // text colour the parent sets (important inside coloured bubbles).
    <div className={cn("text-inherit", className)}>
      <ReactMarkdown
        // remark plugins run on the Markdown source before it's converted to HTML
        remarkPlugins={[
          remarkGfm, // enables tables, strikethrough, task lists, autolinks
        ]}
        // rehype plugins run on the HTML AST after conversion
        rehypePlugins={[
          rehypeHighlight, // adds hljs class names for syntax colouring
        ]}
        // Our custom-styled element overrides
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
