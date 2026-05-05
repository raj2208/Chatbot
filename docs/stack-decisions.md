# Stack Decisions

Every tool chosen and the reason behind it.

| Layer | Tool | Reason |
|---|---|---|
| Language | TypeScript | Already used day to day — no context switch |
| LLM | Google Gemini (free tier) | Free, handles both LLM and embeddings, swap for Claude later is a one-line change |
| Embeddings | Google Gemini embedding API | Same account and API key as the LLM — no second provider needed |
| Vector database | Supabase (pgvector) | Free tier, Postgres-based so it uses existing database knowledge |
| App framework | Next.js | Works natively with the Vercel AI SDK |
| AI SDK | Vercel AI SDK | TypeScript-native, clean streaming, easy to switch LLM providers |

## Why Gemini over Claude to start

Claude requires a paid Anthropic API account. This is a separate product from a Claude Pro subscription — they are not the same thing. Gemini has a genuinely free tier. Once the project is in a good state, swapping to Claude is a one-line change in the Vercel AI SDK config.

## Why markdown files as the knowledge base

Markdown files live in a `knowledge-base/` folder and are the chatbot's brain. The ingest script reads them, chunks them by heading, embeds each chunk, and stores the vectors in Supabase. This is "documentation as code" — the docs are the data source. The markdown approach changes nothing about the RAG architecture; only the ingest step reads files instead of a database.

## Why Vercel AI SDK

It abstracts LLM providers behind a common interface. Switching from Gemini to Claude (or any other provider) later requires changing the provider import and model name, not rewriting the streaming logic or API route structure.
