# Project Overview

## Goal

Build a chatbot that works like a general-purpose LLM (ChatGPT, Gemini, Claude) but can also answer questions from a specific private knowledge base — in this case, markdown files.

## The Problem with Plain LLMs

A normal LLM only knows what it was trained on. It cannot know about your private documents, your company's internal data, or anything that wasn't in its training set.

## The Solution: RAG

**RAG — Retrieval-Augmented Generation** solves this by combining two systems:

- The LLM handles language — it understands questions and forms fluent answers
- A vector database stores your specific information as searchable embeddings
- When a user asks something, the system retrieves the relevant pieces and feeds them to the LLM as context

This is exactly how Notion AI, GitHub Copilot Chat (over your codebase), and custom enterprise chatbots work.

## Architecture Flow

```
User asks a question
        |
        v
Embed the question into a vector
        |
        v
Search the vector database for the most relevant chunks
        |
        v
Pass question + retrieved chunks to the LLM as context
        |
        v
LLM generates an answer grounded in your data
        |
        v
Return answer to the user
```

## The Four Building Blocks

### 1. Ingest (one-time setup)

- Take your documents (markdown files in `knowledge-base/`)
- Split them into chunks (by heading)
- Convert each chunk into a vector embedding
- Store the vectors in Supabase (pgvector)

### 2. Retrieve (every query)

- Embed the user's question using the same embedding model
- Search the vector database for the closest matching chunks
- Return the top N most relevant chunks

### 3. Generate (every query)

- Build a prompt with the user's question + the retrieved chunks
- Send it to the LLM
- The LLM answers based on the provided context, not just its training data

### 4. Chat Interface

- A Next.js page where users type questions and get streaming answers
- Conversation history maintained so follow-up questions work
