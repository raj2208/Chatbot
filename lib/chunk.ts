// ============================================================
// lib/chunk.ts  —  splits markdown files into RAG-ready chunks
// ============================================================
//
// WHY CHUNK AT ALL?
// ─────────────────
// An embedding model converts text into a fixed-size vector (a list
// of ~3072 numbers). If you embed an entire 5,000-word document as
// one vector, all the information gets averaged together. Ask about
// "parental leave" and the vector is pulled toward every topic in
// the file — products, org structure, HR — so your similarity search
// returns poor matches.
//
// Splitting by heading means each chunk is about ONE topic. "Parental
// Leave" becomes its own vector, tightly clustered with other
// family-leave content in the embedding space. When the user asks
// about parental leave, we find that chunk and nothing else.
//
// CHUNKING STRATEGY: split on Markdown headings (## and ###)
// ───────────────────────────────────────────────────────────
// Each level-2 or level-3 heading starts a new chunk. We keep the
// heading text inside the chunk so the embedding captures the topic
// label as well as the content.
//
// Example — input:
//   ## Parental Leave
//   Primary caregiver: 26 weeks paid…
//   ## Sick Leave
//   12 days per calendar year…
//
// Output: two chunks, each with their heading included.

import fs from "fs";
import path from "path";

// ── Types ─────────────────────────────────────────────────────

export interface RawChunk {
  id: string;      // slug used as a stable identifier, e.g. "hr-parental-leave"
  source: string;  // filename, e.g. "hr-and-policies.md"
  heading: string; // the heading text, e.g. "Parental Leave"
  content: string; // heading + body text (what we embed)
}

// ── chunkMarkdownFile ─────────────────────────────────────────
//
// Reads one .md file and returns an array of RawChunks.
// Splits on any line that starts with ## or ### (level-2 and level-3
// headings). Level-1 (#) headings are treated as file titles and used
// to name the first implicit chunk if there's content before ## appears.
export function chunkMarkdownFile(filePath: string): RawChunk[] {
  const filename = path.basename(filePath);           // "hr-and-policies.md"
  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.split("\n");

  const chunks: RawChunk[] = [];

  // currentHeading and currentLines accumulate the in-progress chunk.
  let currentHeading = filename.replace(".md", ""); // fallback heading = filename
  let currentLines: string[] = [];

  // Regex matches lines starting with ## or ### (but NOT ####+ or #)
  const headingRegex = /^#{2,3}\s+(.+)/;

  function flushChunk() {
    // Join and clean up the accumulated lines
    const body = currentLines.join("\n").trim();

    // Skip tiny chunks — they're usually empty sections or separators.
    // 80 chars ≈ roughly one real sentence.
    if (body.length < 80) return;

    // Build a slug: lowercase, spaces → hyphens, strip special chars.
    // Used as a stable ID so we can reference a specific chunk later.
    const slug = `${filename.replace(".md", "")}-${currentHeading}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    // The content we embed includes the heading so the topic label
    // is part of the vector — this improves retrieval accuracy.
    chunks.push({
      id: slug,
      source: filename,
      heading: currentHeading,
      content: `${currentHeading}\n\n${body}`,
    });
  }

  for (const line of lines) {
    const match = line.match(headingRegex);

    if (match) {
      // We hit a new heading — flush what we have, then start fresh.
      flushChunk();
      currentHeading = match[1].trim(); // e.g. "Parental Leave"
      currentLines = [];
    } else {
      // Accumulate this line into the current chunk.
      currentLines.push(line);
    }
  }

  // Don't forget the last chunk (no heading after it to trigger flush).
  flushChunk();

  return chunks;
}

// ── chunkAllFiles ──────────────────────────────────────────────
//
// Walks every .md file in a directory and chunks them all.
// Skips files listed in `skipFiles` (e.g. questions.md — that's test
// data, not knowledge to embed).
export function chunkAllFiles(
  dir: string,
  skipFiles: string[] = []
): RawChunk[] {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md") && !skipFiles.includes(f));

  console.log(
    `[chunk] found ${files.length} file(s) to chunk: ${files.join(", ")}`
  );

  const allChunks: RawChunk[] = files.flatMap((file) =>
    chunkMarkdownFile(path.join(dir, file))
  );

  console.log(`[chunk] produced ${allChunks.length} chunks total`);
  return allChunks;
}
