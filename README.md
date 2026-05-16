# NotebookLM-style RAG Application (Version 2)

A production-quality, **accuracy-focused** Retrieval-Augmented Generation (RAG) application. Upload documents, ask questions in natural language, and receive answers grounded in your sources—with inline citations and transparent retrieval debugging.

Built with **Next.js**, **Express**, **Pinecone**, local **BM25**, and **Groq** (free-tier friendly).

---

## Project Overview

This system behaves like a lightweight NotebookLM clone:

1. You upload documents (PDF, TXT, DOCX, CSV).
2. The backend extracts text, chunks it, embeds it, and indexes it in Pinecone (semantic search) plus a local chunk store (keyword search).
3. You select which documents to query and ask questions in chat.
4. A **multi-stage RAG pipeline** rewrites your question, retrieves candidates with hybrid search, filters chunks with an LLM relevance judge, and generates a grounded answer with `[1]` `[2]` citations.
5. The UI shows the answer and expandable source cards (file name, chunk index, relevance score, citation usage).

**Design priority:** retrieval **accuracy** over latency. The pipeline uses **three Groq LLM calls** per question (rewrite, evaluate, generate) plus local embeddings and BM25—no paid embedding API required.

---

## New Features in Version 2

| Feature | What it does |
|---------|----------------|
| **LLM query rewriting** | Turns vague or follow-up questions into clear, standalone retrieval queries (uses chat history for pronouns). |
| **Hybrid retrieval** | Combines **dense** vector search (Pinecone) with **BM25** keyword search (local). |
| **BM25 support** | Exact-term and rare-token matching via `okapibm25`; chunk text stored under `server/data/chunks/`. |
| **LLM chunk relevance evaluation** | One batched call scores all retrieved candidates and drops weak chunks before generation. |
| **Improved grounding** | Only high-relevance chunks reach the answer model; strict “not in documents” fallback. |
| **Citation support** | Numbered sources `[1]…[N]` in context; optional inline citations in answers; UI highlights cited sources. |

---

## Architecture Flow

```
User Query
   ↓
LLM Query Rewriter          ← Groq (lightweight model)
   ↓
Hybrid Retrieval            ← Pinecone (dense) + BM25 (local)
   ↓
LLM Chunk Evaluator         ← Groq (one batched JSON call)
   ↓
Filtered Context            ← Top chunks by relevance score
   ↓
LLM Response Generator      ← Groq (capable model, citation-aware)
   ↓
Final Answer + Sources
```

### Ingestion flow

```
Upload → Extract text → Chunk (500 chars / 100 overlap)
      → Embed (MiniLM-L6-v2, 384-dim)
      → Upsert Pinecone + save local chunk JSON for BM25
```

### Backend modules (educational layout)

| Service | Role |
|---------|------|
| `queryRewriteService.js` | Step 2 — retrieval-focused query |
| `hybridRetrievalService.js` | Step 3 — dense + BM25 fusion |
| `chunkRelevanceService.js` | Step 4 — batched relevance scoring |
| `responseGenerationService.js` | Step 5 — grounded answer + citations |
| `chatService.js` | Orchestrates the full pipeline |
| `chunkTextStore.js` | Local BM25 corpus per `fileId` |

---

## Why These Improvements Matter

### Retrieval accuracy

- **Query rewrite** bridges the gap between conversational language and embedding-friendly queries.
- **Hybrid retrieval** improves **recall**: semantic search finds paraphrases; BM25 finds exact names, IDs, and rare terms.
- **LLM reranking** improves **precision**: similarity scores ≠ usefulness for answering the question.

### Hallucination reduction

- Noisy chunks are filtered **before** the final prompt.
- The generator is instructed to use **only** provided citation blocks and to abstain with a fixed message when context is insufficient.
- Inline `[n]` markers tie claims to verifiable source text in the UI.

### Semantic + keyword retrieval

Embeddings excel at meaning; BM25 excels at lexical overlap. Fusing both reduces the chance that the right chunk never appears in the candidate pool.

---

## API Cost Discussion

Each chat message uses **exactly three Groq completions** (when all stages are enabled):

| # | Stage | Default model | Typical role |
|---|--------|----------------|--------------|
| 1 | Query rewrite | `llama-3.1-8b-instant` | Short rewrite |
| 2 | Chunk evaluation | `llama-3.1-8b-instant` | JSON scores for ≤24 chunks |
| 3 | Answer generation | `llama-3.3-70b-versatile` | Final grounded answer |

**Why this is feasible on free Groq**

- Two calls use a **small, fast** model.
- Chunk judging is **one batched request**, not one call per chunk.
- Embeddings run **locally** (Transformers.js); BM25 runs **in-process**—no extra LLM cost for retrieval.

**Tradeoff:** Higher latency and rate-limit usage than single-call RAG; disable stages via env vars if you need to conserve quota (see below).

---

## Tech Stack

### Frontend

- Next.js 16 (App Router), React 19, Tailwind CSS
- Axios API client, `localStorage` for file list and selections

### Backend

- Node.js, Express 5, Multer
- **Vector DB:** Pinecone (cosine, 384-dim)
- **Embeddings:** `Xenova/all-MiniLM-L6-v2` via `@xenova/transformers` (local, no API key)
- **Lexical search:** `okapibm25` over `server/data/chunks/*.json`
- **LLM:** Groq SDK
- **Chunking:** LangChain `RecursiveCharacterTextSplitter`
- **Parsing:** pdf-parse, mammoth (DOCX)

---

## Prerequisites

- Node.js **20+**
- npm or yarn
- [Groq API key](https://console.groq.com) (free tier)
- [Pinecone account](https://www.pinecone.io) (free tier)

---

## Installation

```bash
cd notebooklm_clone

# Backend
cd server
npm install

# Frontend (separate terminal)
cd ../client
npm install
```

---

## Environment Variables

### Backend — `server/.env`

Copy from `server/.env.example`:

```env
# Required
GROQ_API_KEY=
PINECONE_API_KEY=
PINECONE_INDEX_NAME=
PORT=3001
PINECONE_CLOUD=aws
PINECONE_REGION=us-east-1
FRONTEND_URL=http://localhost:3000

# Step 2 — Query rewriting
ENABLE_QUERY_REWRITE=true
QUERY_REWRITE_MODEL=llama-3.1-8b-instant
QUERY_REWRITE_MAX_HISTORY_MESSAGES=6

# Step 3 — Hybrid retrieval
ENABLE_HYBRID_RETRIEVAL=true
RETRIEVAL_TOP_K=24
DENSE_RETRIEVAL_WEIGHT=0.5
SPARSE_RETRIEVAL_WEIGHT=0.5

# Step 4 — Chunk relevance filter
ENABLE_CHUNK_EVALUATOR=true
CHUNK_EVALUATOR_MODEL=llama-3.1-8b-instant
RERANK_TOP_K=8
CHUNK_RELEVANCE_MIN_SCORE=5

# Step 5 — Grounded generation
RESPONSE_GENERATION_MODEL=llama-3.3-70b-versatile
ENABLE_INLINE_CITATIONS=true
GENERATION_MAX_HISTORY_MESSAGES=4

# Debugging
RAG_DEBUG=false
```

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_QUERY_REWRITE` | `true` | LLM rewrite before embed |
| `ENABLE_HYBRID_RETRIEVAL` | `true` | BM25 + dense fusion |
| `RETRIEVAL_TOP_K` | `24` | Candidates after fusion |
| `DENSE_RETRIEVAL_WEIGHT` / `SPARSE_RETRIEVAL_WEIGHT` | `0.5` / `0.5` | Fusion weights |
| `ENABLE_CHUNK_EVALUATOR` | `true` | Batched LLM rerank |
| `RERANK_TOP_K` | `8` | Chunks sent to generator |
| `CHUNK_RELEVANCE_MIN_SCORE` | `5` | Drop chunks below (0–10) |
| `RAG_DEBUG` | `false` | Console logs + `debug` in API response |

### Frontend — `client/.env.local`

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
```

---

## Running Locally

**Terminal 1 — API**

```bash
cd server
npm run dev
```

**Terminal 2 — UI**

```bash
cd client
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

On first upload, the embedding model loads locally (may take a moment). Pinecone index is created automatically if missing.

---

## Deployment

Typical layout:

1. Deploy **Express** (`server`) to Railway, Render, Fly.io, etc. Set all `server/.env` variables.
2. Deploy **Next.js** (`client`) to Vercel. Set `NEXT_PUBLIC_API_BASE_URL` to your API URL.
3. Set `FRONTEND_URL` on the API to your frontend origin (CORS).
4. Ensure the server has a **persistent volume** or equivalent for `server/uploads/` and `server/data/` (chunk JSON + file registry)—ephemeral disks lose BM25 indexes on restart unless you re-upload.

**Note:** Documents uploaded before enabling hybrid retrieval need **re-upload** once so local BM25 chunk files exist.

---

## How to Use

1. **Upload** — PDF, TXT, DOCX, or CSV via the sidebar or upload zone.
2. **Select documents** — Check files to include in retrieval.
3. **Chat** — Ask questions; follow-ups send conversation history for rewriting and generation context.
4. **Sources** — Expand “Sources” to see chunks, relevance scores, and `[n] cited` badges.
5. **Debug** — Set `RAG_DEBUG=true` and inspect `debug` in the `/api/chat` JSON response.

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/upload` | Multipart `file` — PDF, TXT, DOCX, CSV |
| `POST` | `/api/chat` | JSON body (see below) |
| `GET` | `/api/files` | List uploaded file metadata |
| `DELETE` | `/api/files/:fileId` | Delete file, Pinecone vectors, BM25 chunks |
| `GET` | `/health` | Health check |

### `POST /api/chat`

```json
{
  "message": "What about scalability?",
  "selectedFileIds": ["uuid-1", "uuid-2"],
  "conversationHistory": [
    { "role": "user", "content": "Explain the architecture." },
    { "role": "assistant", "content": "The system uses RAG..." }
  ]
}
```

**Response (abridged):**

```json
{
  "answer": "Vector databases scale horizontally [1].",
  "sources": [
    {
      "citationId": 1,
      "fileId": "uuid-1",
      "fileName": "doc.pdf",
      "chunkIndex": 3,
      "text": "...",
      "relevanceScore": 9,
      "relevanceReason": "Discusses horizontal scaling",
      "citedInAnswer": true
    }
  ],
  "debug": {}
}
```

`debug` is populated only when `RAG_DEBUG=true` (includes `queryRewrite`, `retrieval`, `chunkEvaluation`, `generation`).

---

## Technical Design Decisions

| Decision | Rationale | Tradeoff |
|----------|-----------|----------|
| **3-stage LLM pipeline** | Each stage solves one failure mode (query, recall, precision, generation) | More latency and API calls than naive RAG |
| **Local MiniLM embeddings** | Free, private, no rate limits | Weaker than larger embedding models |
| **BM25 on disk** | Pinecone has no native sparse search in this setup | Extra storage; must re-upload legacy docs |
| **Min–max fusion** | Simple, interpretable hybrid scoring | Not as robust as learned rerankers or RRF (future work) |
| **Batched chunk evaluator** | Cost-efficient on Groq free tier | Large corpora may need smaller `RETRIEVAL_TOP_K` |
| **Fail-open on rewrite/eval errors** | Chat remains available if Groq is down | Occasionally falls back to weaker retrieval |
| **Temperature 0** | Factual, grounded answers | Less creative phrasing |

---

## Project Layout

```
notebooklm_clone/
├── client/                 # Next.js UI
│   └── src/
│       ├── components/     # ChatPanel, SourceCards, NotebookApp, …
│       └── services/       # apiClient.ts
└── server/
    ├── controllers/        # upload, chat, files
    ├── services/           # RAG pipeline modules
    ├── utils/              # env, chunkTextStore, fileMetadataStore
    ├── data/
    │   ├── files.json      # upload registry (gitignored)
    │   └── chunks/         # BM25 corpus per file (gitignored)
    └── uploads/            # raw files (gitignored)
```

---

## Document Processing

1. Extract text (PDF / TXT / DOCX / CSV).
2. Chunk: **500 characters**, **100 overlap** (`RecursiveCharacterTextSplitter`).
3. Embed with **all-MiniLM-L6-v2** (384 dimensions, normalized).
4. Upsert to Pinecone with metadata: `fileId`, `fileName`, `chunkIndex`, `text`.
5. Save the same chunks to `server/data/chunks/{fileId}.json` for BM25.

---

## Future Improvements

Possible extensions (not implemented):

- **GraphRAG** — knowledge-graph traversal for multi-hop questions
- **Self-RAG** — model reflects on whether retrieval is needed
- **Agentic retrieval** — iterative tool-using search loops
- **Multimodal retrieval** — images, slides, tables in PDFs
- **Local cross-encoder rerankers** — e.g. `bge-reranker` without LLM rerank cost
- **Reciprocal Rank Fusion (RRF)** — alternative to weighted score fusion

---

## License

ISC (see `server/package.json`).
