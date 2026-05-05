# RAG Implementation

## What is RAG?

RAG stands for **Retrieval-Augmented Generation**. It solves a fundamental problem with LLMs: a model trained on the public internet knows nothing about your private data — your company policies, your product specs, your internal documentation.

RAG bridges this gap with three steps on every user query:

1. **Retrieve** — search a vector database for documents semantically similar to the question
2. **Augment** — inject those documents into the LLM's context window as a system prompt
3. **Generate** — let the LLM answer using only that grounded context

The LLM is instructed to say "I don't know" if the answer isn't in the retrieved chunks. This prevents hallucination of company-specific facts.

---

## Architecture

```
knowledge-base/*.md
       │
       │  pnpm ingest  (run once, or after edits)
       ▼
scripts/ingest.ts
  └── lib/chunk.ts       → split each file into sections by heading
  └── lib/embed.ts       → call Gemini embedding API for each chunk
       └── data/embeddings.json   (79 chunks × 3072-dim vectors)

──────────────── at query time ─────────────────────────────────────

User question
       │
       ▼
lib/embed.ts             → embed question (RETRIEVAL_QUERY task type)
       │
       ▼
lib/search.ts            → cosine similarity against all 79 stored vectors
       │                    return top 3 chunks
       ▼
app/api/chat/route.ts    → inject chunks into system prompt
       │
       ▼
Gemini (gemini-2.5-flash) → generate answer grounded in context
       │
       ▼
Streaming response → frontend (app/page.tsx)
```

---

## Files Created / Modified

### New files

| File | Purpose |
|------|---------|
| `lib/chunk.ts` | Reads .md files, splits by `##` and `###` headings, returns `RawChunk[]` |
| `lib/embed.ts` | Wraps Gemini embedding API; exports `embedText` (single) and `embedBatch` (many) |
| `lib/search.ts` | Loads `data/embeddings.json`, embeds query, ranks chunks by cosine similarity |
| `scripts/ingest.ts` | One-time script: chunks → embeds → writes `data/embeddings.json` |
| `data/.gitkeep` | Keeps the `data/` folder in git (the JSON file itself is gitignored) |
| `docs/rag-implementation.md` | This file |

### Modified files

| File | What changed |
|------|-------------|
| `app/api/chat/route.ts` | Added RAG: retrieves chunks, builds system prompt, passes to Gemini |
| `package.json` | Added `"ingest": "tsx scripts/ingest.ts"` script |
| `.gitignore` | Added `data/embeddings.json` (large, auto-generated) |

---

## Key Design Decisions

### Local JSON store (not Supabase)
The knowledge base has 79 chunks. Loading 4.7 MB of JSON into RAM and doing cosine similarity in Node.js takes ~5 ms — fast enough that there's no reason to introduce a database. The natural upgrade path is Supabase with pgvector when the knowledge base grows past a few thousand chunks.

### Chunking by heading
Splitting on `##` / `###` headings means each chunk covers one topic. A whole-document embedding averages all topics into one vector, which gives poor retrieval. Heading-based chunks produce tight, topically coherent vectors.

### Task types: RETRIEVAL_DOCUMENT vs RETRIEVAL_QUERY
Gemini's embedding model is fine-tuned with different task types. Using `RETRIEVAL_DOCUMENT` at ingest time and `RETRIEVAL_QUERY` at search time produces vectors that are directly comparable for question→document matching. Using the wrong type degrades recall.

### topK = 3
We retrieve 3 chunks per query. Fewer misses relevant context; more adds noise and fills the context window with irrelevant text. 3 is the standard starting point — tune this once you have real usage data.

### Retrieval failure is non-fatal
If the vector search throws (e.g. first startup before ingest), the route logs a warning and falls back to answering without context. The chatbot still works, just without company knowledge.

---

## Embedding Model

- **Model:** `gemini-embedding-001`
- **Dimensions:** 3072 floats per vector
- **API key:** same `GOOGLE_GENERATIVE_AI_API_KEY` used for chat — no new credentials needed
- **Cost on free tier:** free (subject to Google's rate limits)

---

## Running Ingest

```bash
# First time, or after adding/editing knowledge-base files:
pnpm ingest
```

The script:
1. Chunks all `.md` files in `knowledge-base/` (skips `questions.md`)
2. Embeds in batches of 5 with 1-second pauses (avoids free-tier rate limits)
3. Writes `data/embeddings.json`

If you see 429 errors, increase `DELAY_MS` in `scripts/ingest.ts`.

---

## Testing RAG

Use the questions in `knowledge-base/questions.md`. They're grouped as:

- **Simple** (1–15): single fact lookups — retrieval should find one clear chunk
- **Medium** (16–25): two facts from the same file — tests whether the right section is retrieved
- **Hard** (26–35): cross-file reasoning — tests whether the top-3 chunks cover all needed information
- **Trick** (36–45): questions with no answer in the knowledge base — the bot should say "I don't have that information" rather than hallucinating

---

## What Comes Next (RAG improvements)

1. **Re-ranking** — after retrieval, use a cross-encoder model to re-score chunks more accurately
2. **Hybrid search** — combine vector search with keyword search (BM25) for better recall on exact terms like product names
3. **Supabase pgvector** — replace the JSON file with a proper vector database when the knowledge base grows
4. **Streaming retrieval indicator** — show the user which sources were used in the answer
5. **Chunk overlap** — when splitting by heading, include a few lines of the previous section to avoid cutting answers at boundaries
