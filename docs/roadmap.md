# Roadmap

## Concepts Already Studied

These are covered in the Artificial-Intelligence repo under `llms/`:

| Concept | File |
|---|---|
| What is an LLM | `llms/what-is-an-llm.md` |
| Tokens and context windows | `llms/tokens-and-context-windows.md` |
| RAG overview | `llms/rag.md` |
| RAG deep dive | `llms/rag-deep-dive.md` |
| Embeddings | `llms/embeddings.md` |
| Chunking strategies | `llms/chunking.md` |
| Vector databases | `llms/vector-databases.md` |
| How vectors encode meaning | `llms/how-vectors-encode-meaning.md` |

## Build Order

1. Set up Supabase and create the vector table (`supabase/schema.sql`)
2. Get a Gemini API key (free via Google AI Studio)
3. Add Vercel AI SDK and Gemini provider as dependencies
4. Write the ingest script (`scripts/ingest.ts`)
5. Write the embed and search helpers (`lib/embed.ts`, `lib/search.ts`)
6. Build the retrieve + generate API route (`app/api/chat/route.ts`)
7. Build the chat UI (`app/page.tsx`)
8. Populate `knowledge-base/` with real markdown content
9. Run ingest, test end to end with real questions
10. Swap Gemini for Claude when ready (one-line provider change in the Vercel AI SDK)
