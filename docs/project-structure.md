# Project Structure

The planned folder layout and purpose of each piece.

```
chatbot/
├── knowledge-base/           ← .md files that are the chatbot's knowledge (the "brain")
├── scripts/
│   └── ingest.ts             ← one-time script: reads md files, chunks, embeds, stores in Supabase
├── app/
│   ├── page.tsx              ← chat UI (the frontend the user sees)
│   └── api/
│       └── chat/
│           └── route.ts      ← API route: retrieve relevant chunks + call LLM to generate answer
├── lib/
│   ├── embed.ts              ← helper: call Gemini embedding API to turn text into a vector
│   └── search.ts             ← helper: query Supabase pgvector to find closest matching chunks
├── supabase/
│   └── schema.sql            ← SQL to create the vector table in Supabase
├── docs/                     ← this folder
└── .env.local                ← API keys — never committed to git
```

## How it flows together

1. **Once at setup:** run `scripts/ingest.ts` — it reads every file in `knowledge-base/`, chunks by heading, calls `lib/embed.ts` for each chunk, and stores the vector + content in Supabase.

2. **Every user request:** the chat page (`app/page.tsx`) sends the message to `app/api/chat/route.ts`, which calls `lib/embed.ts` to embed the question, calls `lib/search.ts` to find the top matching chunks, builds a prompt from question + chunks, streams the LLM response back.

## Current state

The repo is at the Next.js bootstrapped stage. The folder structure above represents what will be built — nothing beyond the base Next.js app exists yet.
