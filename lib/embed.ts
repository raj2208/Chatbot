// ============================================================
// lib/embed.ts  —  turns text into embedding vectors via Gemini
// ============================================================
//
// WHAT IS AN EMBEDDING?
// ─────────────────────
// An embedding is a list of numbers (a vector) that represents the
// *meaning* of a piece of text in a high-dimensional space.
//
// Texts with similar meaning end up with similar vectors — "dog food"
// and "canine nutrition" are close together; "dog food" and "tax law"
// are far apart. This is what lets us do semantic search: instead of
// matching keywords, we find chunks whose *meaning* is close to the
// query's meaning.
//
// MODEL: gemini-embedding-001
// ───────────────────────────
// Google's Gemini embedding model produces 3072-dimensional vectors.
// It supports a `taskType` hint that tells the model what the text is
// being used for, which improves accuracy:
//
//   RETRIEVAL_DOCUMENT → use when embedding knowledge base chunks
//   RETRIEVAL_QUERY    → use when embedding the user's question
//
// Using the correct task type is important — the model is fine-tuned
// to produce vectors that are comparable between documents and queries
// when these hints are used.
//
// SAME API KEY
// ────────────
// The Gemini embedding API uses the same GOOGLE_GENERATIVE_AI_API_KEY
// as the chat (generation) API. No new key or account needed.

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { embed, embedMany } from "ai";

// ── Embedding model instance ──────────────────────────────────
//
// We create the Google provider and call .textEmbeddingModel() to
// get a model object the SDK's embed/embedMany functions can use.
//
// gemini-embedding-001 is the current production embedding model.
// It produces 3072-dimensional float vectors.
function getEmbeddingModel() {
  const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  });
  return google.textEmbeddingModel("gemini-embedding-001");
}

// ── embedText ─────────────────────────────────────────────────
//
// Embeds a single string and returns the vector.
// Use taskType "RETRIEVAL_QUERY" when embedding a user's question.
// Use taskType "RETRIEVAL_DOCUMENT" when embedding knowledge chunks.
//
// Why separate task types?
// The model was trained with the understanding that query vectors and
// document vectors come from different distributions. Using the right
// hint ensures queries and documents are comparable in the vector space.
export async function embedText(
  text: string,
  taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT" = "RETRIEVAL_QUERY"
): Promise<number[]> {
  const model = getEmbeddingModel();

  const { embedding } = await embed({
    model,
    value: text,
    // The provider-specific options are passed through `providerOptions`
    providerOptions: {
      google: { taskType },
    },
  });

  return embedding;
}

// ── embedBatch ────────────────────────────────────────────────
//
// Embeds multiple strings in one API call (more efficient than calling
// embedText in a loop). Used in the ingest script where we need to
// embed dozens of chunks.
//
// Returns an array of vectors in the same order as the input texts.
// Uses RETRIEVAL_DOCUMENT task type because this is always called for
// knowledge base content during ingest.
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const model = getEmbeddingModel();

  const { embeddings } = await embedMany({
    model,
    values: texts,
    providerOptions: {
      google: { taskType: "RETRIEVAL_DOCUMENT" },
    },
  });

  return embeddings;
}
