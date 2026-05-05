// ============================================================
// scripts/ingest.ts  —  one-time script to build the vector store
// ============================================================
//
// WHAT THIS SCRIPT DOES
// ─────────────────────
// 1. Reads every .md file in knowledge-base/ (skips questions.md)
// 2. Splits each file into chunks by heading (via lib/chunk.ts)
// 3. Embeds each chunk using Gemini's text-embedding-001 model
// 4. Saves all chunks + their vectors to data/embeddings.json
//
// You run this ONCE (or whenever you add/edit knowledge base files).
// The API route then reads this file at query time to do retrieval.
//
// HOW TO RUN:
//   pnpm ingest
//
// PREREQUISITE:
//   GOOGLE_GENERATIVE_AI_API_KEY must be set in .env
//   (it's the same key used for chat — no new key needed)
//
// RATE LIMITING
// ─────────────
// Gemini's free tier allows a certain number of embedding requests
// per minute. We embed in small batches and pause between them to
// avoid hitting rate limits. If you see 429 errors, increase DELAY_MS.
//
// WHEN TO RE-RUN
// ──────────────
// Any time you add, edit, or delete files in knowledge-base/.
// The script always rebuilds from scratch (it doesn't do incremental
// updates). For a small knowledge base this is fast and simple.

// Load .env before anything else so API keys are available.
// tsx (the tool that runs this script) doesn't auto-load .env the
// way Next.js does, so we do it explicitly here.
import "dotenv/config";

import fs from "fs";
import path from "path";
import { chunkAllFiles, type RawChunk } from "../lib/chunk";
import { embedBatch } from "../lib/embed";

// ── Configuration ─────────────────────────────────────────────

const KNOWLEDGE_DIR = path.join(process.cwd(), "knowledge-base");
const OUTPUT_FILE   = path.join(process.cwd(), "data", "embeddings.json");

// Files to skip — test data, not knowledge to embed
const SKIP_FILES = ["questions.md"];

// How many chunks to embed per API call.
// Gemini's embedMany supports batches; we keep this small to avoid
// hitting rate limits on the free tier.
const BATCH_SIZE = 5;

// Pause between batches in milliseconds.
// Increase this if you see 429 (Too Many Requests) errors.
const DELAY_MS = 1000;

// ── Helpers ───────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  console.log("=== Elanco RAG Ingest ===\n");

  // Validate API key exists before doing any work
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    console.error(
      "ERROR: GOOGLE_GENERATIVE_AI_API_KEY is not set.\n" +
      "Add it to your .env file and try again."
    );
    process.exit(1);
  }

  // ── Step 1: Chunk the knowledge base ─────────────────────
  console.log(`Reading markdown files from: ${KNOWLEDGE_DIR}\n`);
  const rawChunks: RawChunk[] = chunkAllFiles(KNOWLEDGE_DIR, SKIP_FILES);

  if (rawChunks.length === 0) {
    console.error("No chunks produced. Check that knowledge-base/ has .md files.");
    process.exit(1);
  }

  console.log(`\nTotal chunks to embed: ${rawChunks.length}\n`);

  // ── Step 2: Embed in batches ──────────────────────────────
  // We split chunks into groups of BATCH_SIZE and embed each group
  // with one API call. After each batch we pause to respect rate limits.
  const results: Array<RawChunk & { embedding: number[] }> = [];

  const totalBatches = Math.ceil(rawChunks.length / BATCH_SIZE);

  for (let i = 0; i < rawChunks.length; i += BATCH_SIZE) {
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const batch = rawChunks.slice(i, i + BATCH_SIZE);

    console.log(
      `Embedding batch ${batchNumber}/${totalBatches} ` +
      `(chunks ${i + 1}–${Math.min(i + BATCH_SIZE, rawChunks.length)})…`
    );

    // Extract the content strings to embed
    const texts = batch.map((c) => c.content);

    let embeddings: number[][];
    try {
      embeddings = await embedBatch(texts);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`\nERROR embedding batch ${batchNumber}: ${msg}`);
      console.error("If this is a 429 error, increase DELAY_MS in this script.");
      process.exit(1);
    }

    // Pair each chunk with its embedding vector
    batch.forEach((chunk, idx) => {
      results.push({ ...chunk, embedding: embeddings[idx] });
    });

    console.log(`  ✓ batch ${batchNumber} done`);

    // Pause before next batch (skip the pause after the last batch)
    if (i + BATCH_SIZE < rawChunks.length) {
      await sleep(DELAY_MS);
    }
  }

  // ── Step 3: Save to disk ──────────────────────────────────
  // Ensure the data/ directory exists
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2), "utf-8");

  const sizeKb = (fs.statSync(OUTPUT_FILE).size / 1024).toFixed(1);

  console.log(`\n=== Ingest complete ===`);
  console.log(`Chunks embedded : ${results.length}`);
  console.log(`Output file     : ${OUTPUT_FILE}`);
  console.log(`File size       : ${sizeKb} KB`);
  console.log(`\nYou can now start the dev server and ask questions about Elanco.`);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
