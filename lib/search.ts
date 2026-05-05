// ============================================================
// lib/search.ts  —  searches the vector store for relevant chunks
// ============================================================
//
// HOW VECTOR SEARCH WORKS
// ───────────────────────
// 1. At ingest time, we converted every knowledge base chunk into a
//    vector and saved them all in data/embeddings.json.
//
// 2. At query time (when a user asks a question), we:
//    a. Embed the question into a vector (RETRIEVAL_QUERY task type)
//    b. Compare that vector against every stored chunk vector
//    c. Return the top N chunks whose vectors are closest to the query
//
// "Closeness" is measured with cosine similarity — a value between
// -1 and 1 where 1 means the vectors point in exactly the same
// direction (identical meaning) and 0 means completely unrelated.
//
// We use the `cosineSimilarity` function from the `ai` package rather
// than implementing the math ourselves — it's already there.
//
// STORAGE: local JSON file (data/embeddings.json)
// ────────────────────────────────────────────────
// We store embeddings in a local file rather than a database.
// Pros: zero infrastructure, works offline, easy to inspect.
// Cons: whole file loads into RAM; doesn't scale past ~10,000 chunks.
// For this knowledge base (< 100 chunks) it's perfectly fine.
// The natural upgrade path is Supabase with pgvector — same concept,
// but the similarity search runs in Postgres instead of in Node.

import fs from "fs";
import path from "path";
import { cosineSimilarity } from "ai";
import { embedText } from "./embed";

// ── Types ──────────────────────────────────────────────────────

// What each record in embeddings.json looks like
export interface StoredChunk {
  id: string;
  source: string;       // filename, e.g. "hr-and-policies.md"
  heading: string;      // section heading, e.g. "Parental Leave"
  content: string;      // full chunk text (heading + body)
  embedding: number[];  // 3072-dimensional vector
}

// What we return to the caller — same as StoredChunk but with a
// similarity score attached so the caller can log or threshold it
export interface SearchResult extends StoredChunk {
  score: number; // cosine similarity, 0–1; higher = more relevant
}

// ── loadEmbeddings ─────────────────────────────────────────────
//
// Reads data/embeddings.json from disk.
// Returns an empty array (not an error) if the file doesn't exist —
// this lets the API route fail gracefully when ingest hasn't been run.
function loadEmbeddings(): StoredChunk[] {
  const filePath = path.join(process.cwd(), "data", "embeddings.json");

  if (!fs.existsSync(filePath)) {
    console.warn(
      "[search] embeddings.json not found — run `pnpm ingest` first"
    );
    return [];
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as StoredChunk[];
}

// ── searchChunks ───────────────────────────────────────────────
//
// The main retrieval function. Given a query string, returns the
// top `topK` chunks from the knowledge base ranked by relevance.
//
// Steps:
//  1. Load all stored chunk vectors from disk
//  2. Embed the query (RETRIEVAL_QUERY task type)
//  3. Score every chunk with cosine similarity
//  4. Sort descending and return the top K
//
// topK = 3 is a good default: gives the LLM enough context without
// filling up the prompt with irrelevant text. Too many chunks and
// the LLM starts getting confused by noise.
export async function searchChunks(
  query: string,
  topK: number = 3
): Promise<SearchResult[]> {
  const chunks = loadEmbeddings();

  if (chunks.length === 0) {
    return []; // ingest hasn't been run; caller handles this gracefully
  }

  console.log(
    `[search] embedding query: "${query.slice(0, 60)}${query.length > 60 ? "…" : ""}"`
  );

  // Embed the query with RETRIEVAL_QUERY task type.
  // This is different from the RETRIEVAL_DOCUMENT type used at ingest —
  // using the matching task types is what makes the cosine similarity
  // scores meaningful for question→document retrieval.
  const queryEmbedding = await embedText(query, "RETRIEVAL_QUERY");

  // Score every stored chunk
  const scored: SearchResult[] = chunks.map((chunk) => ({
    ...chunk,
    score: cosineSimilarity(queryEmbedding, chunk.embedding),
  }));

  // Sort by score descending (most relevant first), return top K
  const results = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  console.log(
    `[search] top ${results.length} results:`,
    results.map((r) => `${r.source}§${r.heading} (${r.score.toFixed(3)})`)
  );

  return results;
}

// ── formatContextForPrompt ─────────────────────────────────────
//
// Converts an array of search results into a formatted string that
// we inject into the system prompt.
//
// Format:
//   [Source: company-overview.md — Who We Are]
//   Elanco is a global animal health company…
//
//   [Source: hr-and-policies.md — Parental Leave]
//   Primary caregiver: 26 weeks paid…
//
// The source annotation helps the LLM cite where information came from
// if asked, and also helps during debugging to see which chunks were used.
export function formatContextForPrompt(results: SearchResult[]): string {
  if (results.length === 0) return "";

  return results
    .map(
      (r) =>
        `[Source: ${r.source} — ${r.heading}]\n${r.content}`
    )
    .join("\n\n---\n\n");
}
