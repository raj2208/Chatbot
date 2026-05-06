# RAG at Scale — Developer Portal Implementation

## Context

The current Elanco chatbot works beautifully on 6 markdown files and 79 chunks.
The question is: what happens when you point this at a real company developer
portal — hundreds of pages covering APIs, services, runbooks, architecture
decisions, onboarding guides, and SDK documentation?

This document is an honest engineering analysis of what breaks, why it breaks,
and how to fix it using GCP-native tooling (no Supabase).

---

## What a Developer Portal Actually Looks Like

Before talking about solutions, it's worth being precise about the problem.
A real enterprise developer portal is not a clean collection of well-structured
markdown files. It typically contains:

- **API reference docs** — hundreds of pages with consistent structure but
  dense with parameters, types, and code examples
- **Conceptual guides** — long prose documents explaining architecture and
  mental models; minimal structure
- **Runbooks** — step-by-step operational procedures, often written at 2 AM
  during an incident; inconsistent formatting
- **Architecture Decision Records (ADRs)** — short, opinionated documents
  about past decisions; lots of context that's only meaningful with background
- **Tutorials and quickstarts** — mix of prose and code blocks; often contain
  large code snippets that are useless when split mid-function
- **Changelogs** — repetitive, structured, mostly noise for semantic search
- **Navigation pages and index files** — 10 words per page; pure boilerplate
- **PDFs** — exported from Confluence or Google Docs; require text extraction
  before they can even be processed
- **OpenAPI / Swagger specs** — machine-readable JSON/YAML; not natural
  language at all
- **Video transcripts** — unstructured, colloquial, full of filler words

A naive RAG pipeline that works on clean markdown will produce garbage results
on this kind of content unless you engineer around each of these formats
explicitly.

---

## What Scales Fine (No Changes Needed)

### The embedding model
`gemini-embedding-001` handles any volume. You pay per token at ingest time;
at query time you embed one short string per request. Cost and latency are
not bottlenecks here.

### The chunking logic in principle
Splitting documents into topically coherent pieces is the right idea at any
scale. Only the implementation needs to get smarter (see below).

### The LLM generation step
Gemini 2.5 Flash has a 1 million token context window and can handle large,
dense system prompts. The generation step itself doesn't meaningfully change
as the knowledge base grows.

### The API route structure
The pattern of: embed query → retrieve chunks → inject into system prompt →
stream response is the correct architecture at any scale. You refine each
step; you don't replace the pattern.

---

## What Breaks at Scale (and Why)

### 1. The Local JSON Vector Store

**Current behaviour:**
We write all chunk embeddings to `data/embeddings.json` and load the entire
file into RAM on every API request to do cosine similarity in Node.js.

**Why it breaks:**
At 79 chunks the file is 4.7 MB. Extrapolate:

| Documents | Avg chunks/doc | Total chunks | File size (approx) |
|-----------|---------------|-------------|-------------------|
| 6 (current) | 13 | 79 | 4.7 MB |
| 100 | 15 | 1,500 | ~90 MB |
| 500 | 15 | 7,500 | ~450 MB |
| 2,000 | 15 | 30,000 | ~1.8 GB |

Loading 450 MB of JSON into RAM on every API request, on a Next.js serverless
function that cold-starts, is not viable. It will hit memory limits and add
multi-second latency per request.

The deeper issue: cosine similarity computed in a Node.js loop over 30,000
vectors is O(n) — it gets slower linearly with every new document you add.
A purpose-built vector database runs Approximate Nearest Neighbour (ANN)
search in O(log n) time with sub-millisecond latency at any scale.

**GCP solution: Vertex AI Vector Search**
Formerly called Matching Engine. Google's fully managed, purpose-built vector
similarity search service. Handles tens of millions of vectors with <10ms
query latency. Runs as a managed index — you push vectors to it, query it
via gRPC or REST, never touch the underlying infrastructure.

Alternatively for a gentler migration: **Cloud SQL (PostgreSQL + pgvector
extension)**. Same SQL interface your team already knows, pgvector runs
ANN search inside Postgres, Cloud SQL is fully managed on GCP. Reasonable
up to ~1 million vectors before you'd need to move to Vertex AI Vector Search.

---

### 2. topK = 3 Becomes Too Restrictive

**Current behaviour:**
We retrieve 3 chunks per query and inject all three into the prompt.

**Why it breaks:**
With 79 chunks, 3 is generous — most questions are answered by 1–2 of them.
With 30,000 chunks covering hundreds of services, a question like
"how do I set up authentication for the payments API?" might require:
- One chunk explaining OAuth2 flow for that service
- One chunk with the specific scopes needed
- One chunk with the SDK example code
- One chunk from the getting-started guide explaining prerequisites

If those are 4 different chunks and you only retrieve 3, the answer is
incomplete. You'd need topK = 5 or 7. But increasing topK mechanically
runs into the next problem.

---

### 3. Context Window Filling Up (The Quality Problem)

**Current behaviour:**
3 chunks inject ~800 words into the system prompt. Well within any model's
context window.

**Why it breaks:**
This is not a hard limit problem — Gemini 2.5 Flash's 1M token window means
you technically could inject 1,000 chunks and not crash. The problem is
**attention degradation**.

There is well-documented research (the "Lost in the Middle" paper, Liu et al.
2023) showing that LLMs perform significantly worse at recalling facts that
appear in the middle of a long context. Performance is highest for information
at the very beginning or very end of the context window. If you inject 20
chunks into the prompt, the model will confidently answer based on chunks 1
and 20, and frequently miss chunks 8 through 14.

Practically: more chunks ≠ better answers. Beyond ~5–7 high-quality chunks,
you're adding noise, not signal.

**Solution: Two-stage retrieval (retrieve → re-rank)**

Stage 1 — Retrieve broadly:
Query the vector store for the top 20–30 candidates using fast approximate
search (high recall, moderate precision).

Stage 2 — Re-rank precisely:
Pass the top 20 candidates through a **cross-encoder re-ranker** — a model
that reads both the query and each candidate together (not independently) and
scores their relevance more accurately than embedding similarity alone.
Keep the top 3–5 highest-scored chunks.

Cross-encoders are much slower than embedding similarity (they process pairs,
not single vectors), which is why you don't use them for the initial retrieval.
Two-stage search gets you the speed of vector search with the precision of
a cross-encoder.

**GCP tooling:**
Vertex AI has built-in re-ranking via the **Vertex AI Ranking API**
(generally available as of 2024). You retrieve 20 candidates from Vector
Search, pass them to the Ranking API, get back the top 5 ordered by relevance.
One GCP service, one API call.

---

### 4. Retrieval Precision Drops (The Crowded Space Problem)

**Current behaviour:**
With 79 chunks covering distinct topics (parental leave, tech stack, FMD
vaccine, etc.), the embedding space has clear clusters. A question about
parental leave lands right next to the parental leave chunk and far from
everything else.

**Why it breaks:**
A developer portal has thousands of chunks that are all topically similar —
they're all about software, APIs, authentication, deployments, services.
The embedding space gets crowded. "How do I authenticate?" looks similar
in vector space to dozens of chunks across dozens of services. The top 3
results might be about 3 completely different services that all happen to
use OAuth2.

The core problem: **embedding similarity captures topic, not specificity**.
"Authentication for the payments API" and "authentication for the analytics
API" have nearly identical embeddings even though they're completely different
documents with different instructions.

**Solution: Hybrid Search (vector + keyword)**

Pure semantic search (what we have now) is great at matching meaning.
Pure keyword search (BM25, what search engines used before ML) is great at
matching exact terms — product names, service names, error codes, version
numbers.

Hybrid search combines both:
1. Run vector similarity search → get semantic candidates
2. Run BM25 keyword search on the same query → get lexical candidates
3. Merge and re-rank both result sets using a technique called
   Reciprocal Rank Fusion (RRF)

A query for "payments-service OAuth2 scope" will:
- Get semantically similar chunks (vector search finds auth-related content)
- Get chunks that literally contain "payments-service" (BM25 finds exact match)
- Merge them, and the payment service auth doc scores highest in both — rises to top

**GCP tooling:**
Vertex AI Search (formerly Enterprise Search) supports hybrid search
natively — it runs vector and keyword retrieval internally and merges results.
If you're building the pipeline yourself, BigQuery supports both vector
embeddings (via `VECTOR_SEARCH`) and full-text search (`SEARCH` function),
so you can run hybrid search entirely in SQL.

---

### 5. Chunk Quality Degrades Catastrophically

**Current behaviour:**
All 6 knowledge base files are clean, well-structured markdown with consistent
`##` headings. Every chunk produced is coherent and complete.

**Why it breaks:**
This is the biggest problem and the one most teams underestimate. Poor chunk
quality silently kills RAG quality — the retrieval finds the right document
but the chunk is garbage, so the LLM gets garbage context.

Developer portal specific problems:

**Navigation pages and indexes**
```markdown
# Developer Portal
- [Getting Started](./getting-started)
- [API Reference](./api-reference)
- [Runbooks](./runbooks)
```
Chunking this produces a vector for "Developer Portal Getting Started API
Reference Runbooks" — essentially a meaningless blob that will match everything
and nothing. These need to be identified and skipped before embedding.

**Code-heavy pages**
A page that's 70% code blocks and 30% prose produces a chunk where the
semantic content is diluted by syntax tokens that mean nothing to an embedding
model. "function authenticate(token: string): Promise<User>" contributes noise
rather than meaning. The code should either be stripped before embedding, or
embedded separately and stored with a `type: "code"` tag so you can filter or
weight it differently.

**Very short chunks**
A heading with one sentence under it:
```markdown
## Rate Limits
See the API reference for rate limit details.
```
This chunk tells the model nothing. Its embedding sits in an ambiguous location
in vector space and will be retrieved for irrelevant queries.

**Very long chunks**
A page with one `##` heading and 3,000 words of prose below it gets
chunked as a single piece. The embedding averages across all 3,000 words and
becomes semantically vague — too many topics, none captured well.

**Broken heading hierarchy**
Some docs use `##` for navigation sections and `####` for actual content
headings. Our chunker splits on `##` and produces huge chunks covering
many sub-topics.

**The solution: Document-aware preprocessing pipeline**

Before chunking, each document goes through a preprocessing stage:

1. **Classification** — identify document type (API ref, guide, runbook, index)
   and apply different chunking strategies per type.

2. **Boilerplate stripping** — remove navigation, headers, footers, breadcrumbs,
   "last updated" dates, and other structural noise before embedding.

3. **Code handling** — strip code blocks before embedding the prose context,
   but store the code blocks separately linked to that chunk (so the LLM
   can still see the code in its response, just without it polluting the vector).

4. **Minimum/maximum chunk size enforcement** — skip chunks under 100 tokens
   (too little semantic signal), split chunks over 800 tokens (too diluted).

5. **Overlap** — include the last 1–2 sentences of the previous chunk at the
   start of the next chunk. This prevents answers that live at a heading
   boundary from being cut in half.

6. **Semantic chunking** — instead of splitting on headings, use a sentence
   embedding model to detect when the topic shifts (cosine similarity between
   adjacent sentence embeddings drops sharply) and split there. More expensive
   at ingest time but produces dramatically better chunks for unstructured docs.

---

### 6. Stale Knowledge

**Current behaviour:**
We run `pnpm ingest` manually and re-embed everything from scratch. Fine
for a static 6-file knowledge base.

**Why it breaks:**
A developer portal has continuous updates — new services launch, APIs deprecate,
runbooks get revised. Manually re-ingesting the entire corpus every time a doc
changes is slow (and expensive if you're paying per embedding token at scale).

Answering with stale chunks is worse than answering with no chunks, because
the LLM confidently presents outdated information as fact.

**Solution: Event-driven incremental ingest**

Each document gets a hash of its content stored alongside its chunks.
When ingest runs, it compares current file hashes against stored hashes:
- File unchanged → skip, reuse existing embeddings (free)
- File changed → re-chunk and re-embed only that file
- File deleted → remove its chunks from the vector store

Triggered automatically via a webhook from your documentation CMS or a
Cloud Storage change notification → Cloud Run job → re-embed changed files
→ update vectors in Vertex AI Vector Search.

---

## GCP-Native Architecture for Scale

```
┌─────────────────────────────────────────────────────────────┐
│                     INGEST PIPELINE                         │
│                                                             │
│  Developer Portal (Confluence / GitHub / GCS)               │
│           │                                                 │
│           │ file change event                               │
│           ▼                                                 │
│  Cloud Storage (raw docs)                                   │
│           │                                                 │
│           │ trigger                                         │
│           ▼                                                 │
│  Cloud Run Job (ingest worker)                              │
│    ├── preprocess (strip boilerplate, classify type)        │
│    ├── chunk (heading-based + semantic boundary detection)  │
│    ├── embed (Vertex AI gemini-embedding-001)               │
│    └── upsert vectors + metadata                            │
│           │                                                 │
│           ▼                                                 │
│  Vertex AI Vector Search Index (vectors)                    │
│  Cloud SQL PostgreSQL (chunk text, metadata, file hashes)   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     QUERY PIPELINE                          │
│                                                             │
│  User question (via chat UI)                                │
│           │                                                 │
│           ▼                                                 │
│  Cloud Run (Next.js API route)                              │
│    │                                                        │
│    ├─ 1. Metadata filtering                                 │
│    │      e.g. if question mentions "payments service"      │
│    │      pre-filter to chunks tagged payments-service      │
│    │                                                        │
│    ├─ 2. Embed query (gemini-embedding-001, RETRIEVAL_QUERY)│
│    │                                                        │
│    ├─ 3. Hybrid search                                      │
│    │      Vector: Vertex AI Vector Search (top 20)          │
│    │      Keyword: Cloud SQL full-text search (top 20)      │
│    │      Merge: Reciprocal Rank Fusion                     │
│    │                                                        │
│    ├─ 4. Re-rank (Vertex AI Ranking API, keep top 5)        │
│    │                                                        │
│    ├─ 5. Fetch chunk text from Cloud SQL                    │
│    │                                                        │
│    ├─ 6. Build system prompt with context                   │
│    │                                                        │
│    └─ 7. Stream from Gemini 2.5 Flash                       │
│           │                                                 │
│           ▼                                                 │
│  Streaming response to user                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## GCP Services Summary

| Role | Current (local) | GCP at scale |
|------|----------------|-------------|
| Vector store | `data/embeddings.json` | Vertex AI Vector Search |
| Chunk text + metadata | Same JSON | Cloud SQL (PostgreSQL) |
| Embedding model | gemini-embedding-001 via API | Same model, same API |
| Re-ranking | Not implemented | Vertex AI Ranking API |
| Keyword search | Not implemented | Cloud SQL full-text search or BigQuery SEARCH() |
| Ingest trigger | `pnpm ingest` (manual) | Cloud Storage trigger → Cloud Run Job |
| LLM generation | Gemini 2.5 Flash (API) | Same — or Vertex AI Gemini for enterprise SLAs |
| Serving | Next.js dev server | Cloud Run (containerised Next.js) |
| Observability | console.log | Cloud Logging + Cloud Trace |

All of these are services your team already uses at Elanco. No new GCP accounts,
no new vendor relationships.

---

## Realistic Quality Expectations

| Knowledge base size | Architecture needed | Expected quality |
|--------------------|--------------------|--------------------|
| < 200 clean markdown files | Current architecture + Cloud SQL pgvector | Excellent — similar to what you see now |
| 200–1,000 mixed-format docs | + semantic chunking + hybrid search | Very good with proper preprocessing |
| 1,000–10,000 docs (full portal) | + Vertex AI Vector Search + re-ranking + metadata filtering | Good — degrades gracefully, not catastrophically |
| 10,000+ docs | All of the above + dedicated retrieval team | Requires continuous iteration on chunk quality and retrieval strategy |

The honest answer: **quality is mostly determined by chunk quality, not by the
retrieval infrastructure**. A well-preprocessed 2,000-document corpus with
good chunking on Cloud SQL pgvector will beat a poorly-chunked 2,000-document
corpus on Vertex AI Vector Search.

Most RAG failures are not "the vector search returned the wrong document."
They're "the right document was retrieved but the chunk was a navigation page
with 8 words on it."

---

## Migration Path from Current Architecture

This is a step-by-step upgrade path. Each step is independently shippable —
you don't need to do all of them before launching.

### Step 1 — Replace JSON store with Cloud SQL pgvector *(~2 days)*
- Provision a Cloud SQL PostgreSQL instance
- Enable the `vector` extension
- Create a `chunks` table: `id, source, heading, content, embedding vector(3072), metadata jsonb`
- Update `lib/search.ts` to query Cloud SQL instead of reading a file
- Update `scripts/ingest.ts` to upsert into Cloud SQL
- Add hash-based change detection to make ingest incremental

This single step removes the scaling ceiling on the local JSON store and makes
the system viable for thousands of documents. Everything else in the current
codebase stays the same.

### Step 2 — Smarter chunking and preprocessing *(~3 days)*
- Add a preprocessing stage before chunking:
  - Strip navigation/boilerplate (regex + heuristics)
  - Classify document type
  - Extract and separately store code blocks
- Enforce min (100 tokens) and max (600 tokens) chunk sizes
- Add 50-token overlap between adjacent chunks

This step has the highest impact on answer quality relative to effort.

### Step 3 — Hybrid search *(~2 days)*
- Add `tsvector` column to the chunks table (PostgreSQL full-text search)
- Run both vector similarity and keyword search on each query
- Merge results with Reciprocal Rank Fusion before injecting into the prompt

### Step 4 — Re-ranking *(~1 day)*
- After hybrid search returns top 15–20 candidates, call Vertex AI Ranking API
- Keep top 5 for context injection

### Step 5 — Vertex AI Vector Search *(if needed)*
- Only worth the operational overhead at > 500,000 vectors
- The `pgvector` HNSW index on Cloud SQL handles millions of vectors efficiently
  for typical developer portal query rates; you'd only outgrow it under very
  high QPS (queries per second) or very high vector counts

### Step 6 — Event-driven ingest *(~2 days)*
- Set up Cloud Storage bucket for raw docs
- Configure change notification → Pub/Sub → Cloud Run ingest job
- Ingest runs automatically when docs are updated; hash-based diffing
  means only changed files are re-embedded

---

## Things That Never Change

No matter how large the knowledge base:

- The fundamental RAG loop (embed → retrieve → augment → generate) is the same
- The Gemini embedding model is the same
- The system prompt injection pattern is the same
- The "say I don't know if it's not in context" instruction is the same
- The frontend chat UI doesn't change at all

The core architecture you built here is production-correct. It just needs the
storage and retrieval layers upgraded as the dataset grows.

---

## What You Should Actually Do Next

If this is genuinely for your company's developer portal, the practical order is:

1. **Run it on a real sample first.** Take 50 pages from your actual developer
   portal, run them through the current ingest pipeline, and see where chunk
   quality breaks. The failures will tell you exactly which preprocessing steps
   you need. Don't build the full pipeline speculatively.

2. **Fix chunking before fixing infrastructure.** Bad chunks on Vertex AI
   Vector Search are still bad chunks. The JSON store works fine for thousands
   of documents for a low-traffic internal tool.

3. **Add Cloud SQL pgvector when ingest time or query memory becomes a problem.**
   That's your first real infrastructure upgrade and it handles most production
   workloads.

4. **Add hybrid search when you see retrieval failures on exact service/product
   names.** That's the clearest signal that pure semantic search is insufficient.
