// ============================================================
// app/api/chat/route.ts  —  the server-side brain of the chatbot
// ============================================================
//
// This is a Next.js Route Handler (App Router).
// It lives at /api/chat and handles POST requests sent by the
// useChat hook on the frontend.
//
// The flow every time the user sends a message:
//   1.  Frontend sends POST /api/chat with the full conversation history
//   2.  This route converts those UI messages into model messages
//   3.  It calls Gemini via the Vercel AI SDK and streams the reply back
//   4.  The frontend receives the stream and renders it token by token
//
// Why streaming?
//   Without streaming you'd have to wait for the entire response before
//   showing anything — bad UX for long answers. Streaming lets you show
//   each word as it arrives, just like ChatGPT does.

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { convertToModelMessages, streamText, UIMessage } from "ai";

// ── Model list ────────────────────────────────────────────────
// We try the primary model first. If Gemini is overloaded (free
// tier gets hammered), we fall back to the lighter model.
//
// gemini-2.5-flash  → newest, smartest, but busier
// gemini-2.0-flash  → slightly older, usually has more headroom
const PRIMARY_MODEL = "gemini-2.5-flash";
const FALLBACK_MODEL = "gemini-2.0-flash";

// ── Google AI client ──────────────────────────────────────────
// createGoogleGenerativeAI returns a factory function.
// Calling google("model-name") later gives us a model object
// the AI SDK can call.
//
// The API key comes from .env — never hardcode secrets in source.
// Next.js reads .env automatically in development.
const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

// ── POST handler ──────────────────────────────────────────────
// Next.js App Router: export an async function named after the
// HTTP method you want to handle. Only POST is needed here.
export async function POST(req: Request) {
  // Guard: fail fast if the key is missing rather than getting a
  // cryptic 401 from Google buried in a streaming response.
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    console.error("[chat/route] GOOGLE_GENERATIVE_AI_API_KEY is not set");
    return new Response("Server misconfiguration: missing API key", {
      status: 500,
    });
  }

  // ── Parse the request body ──────────────────────────────────
  // The Vercel AI SDK's useChat hook sends a JSON body shaped like:
  //   { messages: UIMessage[] }
  //
  // UIMessage is the SDK's frontend message type — it has:
  //   id, role ("user" | "assistant"), parts (text / files / etc.)
  let messages: UIMessage[];
  try {
    const body = await req.json();
    messages = body.messages;
    console.log(
      `[chat/route] received ${messages.length} message(s), ` +
        `last role: ${messages.at(-1)?.role}`
    );
  } catch {
    console.error("[chat/route] failed to parse request body");
    return new Response("Invalid request body", { status: 400 });
  }

  // ── Convert UIMessage[] → ModelMessage[] ───────────────────
  // UIMessages are for the frontend (they have IDs, part arrays, etc.).
  // The LLM needs a simpler format: role + content string.
  // convertToModelMessages does that translation.
  const modelMessages = await convertToModelMessages(messages);

  // ── Stream with automatic model fallback ───────────────────
  // We try the primary model first. If it throws (overloaded, quota
  // exhausted, etc.) we log the error and retry with the fallback.
  // This makes the chatbot resilient to free-tier demand spikes.
  for (const modelName of [PRIMARY_MODEL, FALLBACK_MODEL]) {
    try {
      console.log(`[chat/route] trying model: ${modelName}`);

      // streamText returns a StreamTextResult — it does NOT start
      // the network call immediately. The call starts when we
      // consume the stream (via toUIMessageStreamResponse below).
      const result = streamText({
        model: google(modelName),
        messages: modelMessages,

        // onFinish fires once the full response is done.
        // Great place to log usage without blocking the stream.
        onFinish: ({ usage }) => {
          console.log(
            `[chat/route] ✓ ${modelName} — ` +
              `in: ${usage.inputTokens} tokens, out: ${usage.outputTokens} tokens`
          );
        },
      });

      // toUIMessageStreamResponse() converts the stream into an
      // HTTP Response with the right headers for the useChat hook
      // to parse on the frontend. This is what actually initiates
      // the streaming back to the browser.
      return result.toUIMessageStreamResponse();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[chat/route] ${modelName} failed: ${message}`);

      // If this was already the fallback, we've exhausted our options.
      if (modelName === FALLBACK_MODEL) {
        return new Response(`Both models unavailable: ${message}`, {
          status: 502,
        });
      }
      // Otherwise: log and loop to try the fallback model.
      console.log(`[chat/route] falling back to ${FALLBACK_MODEL}…`);
    }
  }

  // TypeScript requires a return here, but the loop above always
  // returns before reaching this point.
  return new Response("Unexpected error", { status: 500 });
}
