// ============================================================
// app/api/chat/route.ts  —  RAG-augmented chat endpoint
// ============================================================
//
// FULL RAG FLOW (what happens on every user message):
// ────────────────────────────────────────────────────
//
//   1. Receive the conversation history from the frontend (UIMessage[])
//   2. Extract the user's latest question
//   3. Embed the question → search the vector store → retrieve top 3 chunks
//   4. Build a system prompt that includes those chunks as context
//   5. Call Gemini with: system prompt + full conversation history
//   6. Stream the response back to the frontend
//
// WHY PASS THE FULL HISTORY?
//   The model has no memory between calls — it's stateless. Sending the
//   full messages array recreates the conversation context so the model
//   can answer follow-up questions like "what did you just say?" or
//   "tell me more about that."
//
// WHY A SYSTEM PROMPT WITH CONTEXT?
//   A system message is a special instruction that the model reads before
//   the conversation. By injecting retrieved chunks here, we tell the model
//   to ground its answers in the knowledge base. Without this, the model
//   answers from general training data (which knows nothing about our
//   fake Elanco company).
//
// MODEL FALLBACK
//   We try gemini-2.5-flash first. If it's overloaded (free tier), we
//   fall back to gemini-2.0-flash automatically.

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { convertToModelMessages, streamText, UIMessage } from "ai";
import { searchChunks, formatContextForPrompt } from "@/lib/search";

const PRIMARY_MODEL  = "gemini-2.5-flash";
const FALLBACK_MODEL = "gemini-2.0-flash";

function getGoogle() {
  return createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  });
}

// ── buildSystemPrompt ─────────────────────────────────────────
//
// Constructs the system message the model sees before the conversation.
//
// When we have retrieved context, the prompt instructs the model to:
//   - Answer ONLY from the provided context
//   - Say "I don't have that information" if the context doesn't cover it
//   - NOT use its general training knowledge about Elanco
//
// This "grounding" instruction is what separates a RAG bot from a
// general-purpose bot — it prevents hallucination of company-specific facts.
//
// When retrieval returns no chunks (ingest not yet run), we fall back
// to a general assistant prompt so the chatbot still works.
function buildSystemPrompt(context: string): string {
  if (!context) {
    // Fallback: no knowledge base available yet
    return (
      "You are a helpful AI assistant. " +
      "Answer questions clearly and concisely."
    );
  }

  return `You are a helpful internal assistant for Elanco, an animal health company.

Use ONLY the information provided in the context sections below to answer the user's question.
If the answer is not covered in the context, say: "I don't have that information in my knowledge base."
Do not use general knowledge or make up information about Elanco.
Cite the source (e.g. "According to the HR policy…") when relevant.

--- CONTEXT START ---

${context}

--- CONTEXT END ---`;
}

// ── POST handler ──────────────────────────────────────────────

export async function POST(req: Request) {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    console.error("[chat/route] GOOGLE_GENERATIVE_AI_API_KEY is not set");
    return new Response("Server misconfiguration: missing API key", { status: 500 });
  }

  // ── Parse request ──────────────────────────────────────────
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

  // ── RAG: retrieve relevant chunks ─────────────────────────
  //
  // Extract the latest user message text to use as the search query.
  // We search using only the latest question (not the full history)
  // because we want chunks relevant to what's being asked NOW, not
  // the entire conversation.
  const latestUserMessage = messages
    .filter((m) => m.role === "user")
    .at(-1);

  const queryText = latestUserMessage?.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join(" ") ?? "";

  let systemPrompt = buildSystemPrompt(""); // default: no context

  if (queryText) {
    try {
      console.log(`[chat/route] searching for: "${queryText.slice(0, 60)}…"`);
      const chunks = await searchChunks(queryText, 3);
      const context = formatContextForPrompt(chunks);

      if (context) {
        console.log(`[chat/route] injecting ${chunks.length} chunk(s) into prompt`);
        systemPrompt = buildSystemPrompt(context);
      } else {
        console.log("[chat/route] no chunks found — ingest may not have been run");
      }
    } catch (err) {
      // Retrieval failure should not crash the whole request.
      // We log it and fall back to answering without context.
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[chat/route] retrieval error (continuing without RAG): ${msg}`);
    }
  }

  // ── Convert messages and stream ────────────────────────────
  //
  // convertToModelMessages translates UIMessage[] (frontend format with
  // `parts` arrays) into the simpler role+content format the LLM expects.
  const modelMessages = await convertToModelMessages(messages);

  // Try primary model, fall back to secondary on failure
  for (const modelName of [PRIMARY_MODEL, FALLBACK_MODEL]) {
    try {
      console.log(`[chat/route] streaming with ${modelName}`);

      const google = getGoogle();
      const result = streamText({
        model: google(modelName),
        // system is the instruction the model sees BEFORE the conversation.
        // This is where our retrieved context lives.
        system: systemPrompt,
        messages: modelMessages,
        onFinish: ({ usage }) => {
          console.log(
            `[chat/route] ✓ done — ` +
            `in: ${usage.inputTokens} tokens, out: ${usage.outputTokens} tokens`
          );
        },
      });

      return result.toUIMessageStreamResponse();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[chat/route] ${modelName} failed: ${message}`);

      if (modelName === FALLBACK_MODEL) {
        return new Response(`Both models unavailable: ${message}`, { status: 502 });
      }
      console.log(`[chat/route] falling back to ${FALLBACK_MODEL}…`);
    }
  }

  return new Response("Unexpected error", { status: 500 });
}
