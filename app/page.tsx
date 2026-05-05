// ============================================================
// app/page.tsx  —  the chat UI (client component)
// ============================================================
"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { SendHorizonal, Bot, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { cn } from "@/lib/utils";

export default function Home() {
  // ── useChat ──────────────────────────────────────────────
  // The Vercel AI SDK hook that manages the full conversation:
  //   messages   — UIMessage[]: every message sent and received
  //   sendMessage — append a user message and POST /api/chat
  //   regenerate  — re-POST /api/chat with the same messages (for retries)
  //   clearError  — reset the error state back to "ready"
  //   status     — "ready" | "submitted" | "streaming" | "error"
  //   error      — the Error object if the last request failed
  const { messages, sendMessage, regenerate, clearError, status, error } =
    useChat({
      onError: (err) => console.error("[Chat] stream error:", err.message),
    });

  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // True while waiting for the first token OR while tokens are arriving.
  const isLoading = status === "submitted" || status === "streaming";

  // Scroll to the bottom whenever a new message arrives or while streaming.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Return focus to the input after each response so the user can
  // immediately type again without clicking.
  useEffect(() => {
    if (!isLoading) inputRef.current?.focus();
  }, [isLoading]);

  function handleSubmit(e: { preventDefault: () => void }) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    console.log("[Chat] sending:", text);
    sendMessage({ text });
    setInput("");
  }

  function handleRetry() {
    console.log("[Chat] retrying…");
    clearError();   // dismiss the error banner
    regenerate();   // re-POST the same conversation to /api/chat
  }

  // ── Render ───────────────────────────────────────────────
  //
  // Layout trick for the pinned input bar:
  //
  //   ┌──────────────────────┐  h-screen = full viewport height
  //   │  header (shrink-0)   │  shrink-0 → never shrinks
  //   ├──────────────────────┤
  //   │  messages            │  flex-1  → takes all remaining space
  //   │  (overflow-y-auto    │  min-h-0 → CRITICAL: flex children default to
  //   │   min-h-0)           │           min-height:auto, which lets them grow
  //   │                      │           past the container. min-h-0 overrides
  //   │                      │           that, so this div never exceeds its
  //   │                      │           allocated space.
  //   ├──────────────────────┤
  //   │  input bar (shrink-0)│  shrink-0 → always visible, always at bottom
  //   └──────────────────────┘
  //
  // This is why the input used to scroll away: without min-h-0, the messages
  // div could grow to its full content height, pushing the input off-screen.
  // Overflow on the parent alone isn't enough — you need min-h-0 too.

  return (
    <div className="flex flex-col h-screen bg-background">

      {/* ── Header ─────────────────────────────────────── */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-full bg-primary">
            <Bot className="size-4 text-primary-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-none text-card-foreground">
              Chatbot
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isLoading ? "Thinking…" : "Gemini 2.5 Flash"}
            </p>
          </div>
        </div>
        <ThemeToggle />
      </header>

      {/* ── Message list ────────────────────────────────── */}
      {/*
        We use a plain div with overflow-y-auto instead of the Radix
        ScrollArea here. Radix ScrollArea is great for custom scrollbar
        styling, but for the pinned-input pattern a plain overflow div
        is simpler and works perfectly with flex layout.

        flex-1   → grow to fill all space between header and input bar
        min-h-0  → the critical fix (see comment above)
        overflow-y-auto → scroll when content exceeds the available height
      */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-6">

        {/* Empty state */}
        {messages.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center select-none">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
              <Bot className="size-7 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium text-foreground">How can I help?</p>
              <p className="text-sm text-muted-foreground mt-1">
                Ask me anything — I&apos;m powered by Gemini.
              </p>
            </div>
          </div>
        )}

        <div className="max-w-2xl mx-auto space-y-6 pb-4">
          {messages.map((message) => {
            const isUser = message.role === "user";

            // Extract the raw text from the message parts array.
            // A UIMessage can have multiple parts (text, images, tool calls, etc.)
            // We join all text parts into one string for the renderer.
            const textContent = message.parts
              .filter((p) => p.type === "text")
              .map((p) => p.text)
              .join("");

            return (
              <div
                key={message.id}
                className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}
              >
                {/* Bot avatar — only on assistant messages */}
                {!isUser && (
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary mt-1">
                    <Bot className="size-3.5 text-primary-foreground" />
                  </div>
                )}

                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-3 text-sm",
                    isUser
                      // User bubble: solid primary colour, simple text
                      ? "bg-primary text-primary-foreground rounded-br-sm leading-relaxed"
                      // Assistant bubble: muted background, markdown inside
                      : "bg-muted text-foreground rounded-bl-sm"
                  )}
                >
                  {isUser ? (
                    // User messages are plain text — no markdown needed.
                    // Users type natural language; the LLM is the one using markdown.
                    <span className="whitespace-pre-wrap">{textContent}</span>
                  ) : (
                    // Assistant messages are rendered as full Markdown.
                    // MarkdownRenderer handles headings, lists, code blocks, tables, etc.
                    <MarkdownRenderer content={textContent} />
                  )}
                </div>
              </div>
            );
          })}

          {/* Typing indicator — shown while waiting for the first token */}
          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary mt-1">
                <Bot className="size-3.5 text-primary-foreground" />
              </div>
              <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3">
                <div className="flex gap-1 items-center h-4">
                  <span className="size-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.3s]" />
                  <span className="size-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.15s]" />
                  <span className="size-1.5 rounded-full bg-muted-foreground/60 animate-bounce" />
                </div>
              </div>
            </div>
          )}

          {/* Error banner with retry */}
          {error && (
            <div className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <div className="flex items-start gap-2">
                <AlertCircle className="size-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Something went wrong</p>
                  <p className="text-xs mt-0.5 opacity-80">{error.message}</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetry}
                className="self-start gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
              >
                <RefreshCw className="size-3.5" />
                Retry
              </Button>
            </div>
          )}

          {/*
            Invisible sentinel div at the end of the list.
            scrollIntoView() on this snaps the viewport to the latest message.
            It sits inside the scrollable div (not outside), which is important —
            scrolling a child element doesn't affect the outer page scroll.
          */}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Input bar ────────────────────────────────────── */}
      {/*
        shrink-0 means this div will NEVER shrink, even if the page runs out
        of space. Combined with the messages div having min-h-0, this
        guarantees the input is always visible at the bottom of the screen.
      */}
      <div className="shrink-0 border-t border-border bg-card px-4 py-3">
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 max-w-2xl mx-auto"
        >
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message Gemini…"
            disabled={isLoading}
            className="flex-1 rounded-full h-10 px-4 bg-background"
            onKeyDown={(e) => {
              // Enter submits; Shift+Enter is reserved for future multi-line support
              if (e.key === "Enter" && !e.shiftKey) handleSubmit(e);
            }}
          />
          <Button
            type="submit"
            size="icon"
            disabled={isLoading || !input.trim()}
            className="rounded-full size-10 shrink-0"
          >
            <SendHorizonal className="size-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
