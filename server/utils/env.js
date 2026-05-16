require("dotenv").config();

const PORT = Number(process.env.PORT) || 3001;
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const PINECONE_API_KEY = process.env.PINECONE_API_KEY || "";
const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME || "";
const PINECONE_CLOUD = process.env.PINECONE_CLOUD || "aws";
const PINECONE_REGION = process.env.PINECONE_REGION || "us-east-1";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

/** Dimension for all-MiniLM-L6-v2 embeddings */
const EMBEDDING_DIMENSION = 384;

/**
 * Parse boolean env vars (true | 1 | yes | on).
 * @param {string | undefined} value
 * @param {boolean} defaultValue
 */
function envBool(value, defaultValue) {
  if (value === undefined || value === "") return defaultValue;
  return ["true", "1", "yes", "on"].includes(String(value).toLowerCase());
}

/** Step 2: LLM query rewriting before retrieval */
const ENABLE_QUERY_REWRITE = envBool(process.env.ENABLE_QUERY_REWRITE, true);

/** Small/fast Groq model — one call per chat for rewrite only */
const QUERY_REWRITE_MODEL =
  process.env.QUERY_REWRITE_MODEL || "llama-3.1-8b-instant";

/** Max prior user/assistant turns sent to the rewriter (token control) */
const QUERY_REWRITE_MAX_HISTORY_MESSAGES = Math.max(
  0,
  Number(process.env.QUERY_REWRITE_MAX_HISTORY_MESSAGES) || 6
);

/** Log pipeline stages (rewrite, retrieval, etc.) to server console */
const RAG_DEBUG = envBool(process.env.RAG_DEBUG, false);

/** Step 3: combine Pinecone dense search with local BM25 */
const ENABLE_HYBRID_RETRIEVAL = envBool(process.env.ENABLE_HYBRID_RETRIEVAL, true);

/** Candidate chunks after fusion (wide pool before LLM reranking in Step 4) */
const RETRIEVAL_TOP_K = Math.max(
  1,
  Number(process.env.RETRIEVAL_TOP_K) || 24
);

/** Linear fusion weights (normalized internally when both legs run) */
const DENSE_RETRIEVAL_WEIGHT = Math.max(
  0,
  Number(process.env.DENSE_RETRIEVAL_WEIGHT) || 0.5
);
const SPARSE_RETRIEVAL_WEIGHT = Math.max(
  0,
  Number(process.env.SPARSE_RETRIEVAL_WEIGHT) || 0.5
);

/** Step 4: one batched LLM call to score/filter retrieved chunks */
const ENABLE_CHUNK_EVALUATOR = envBool(process.env.ENABLE_CHUNK_EVALUATOR, true);

/** Model for chunk relevance JSON evaluation */
const CHUNK_EVALUATOR_MODEL =
  process.env.CHUNK_EVALUATOR_MODEL || "llama-3.1-8b-instant";

/** Chunks kept after LLM filtering (sent to answer generator) */
const RERANK_TOP_K = Math.max(1, Number(process.env.RERANK_TOP_K) || 8);

/** Minimum relevance score 0–10 to keep a chunk */
const CHUNK_RELEVANCE_MIN_SCORE = Math.max(
  0,
  Math.min(10, Number(process.env.CHUNK_RELEVANCE_MIN_SCORE) || 5)
);

/** Final answer generation model */
const RESPONSE_GENERATION_MODEL =
  process.env.RESPONSE_GENERATION_MODEL || "llama-3.3-70b-versatile";

/** Step 5: ask the model to cite sources inline as [1], [2], … */
const ENABLE_INLINE_CITATIONS = envBool(process.env.ENABLE_INLINE_CITATIONS, true);

/** Optional prior turns included in generation prompt (not for facts alone) */
const GENERATION_MAX_HISTORY_MESSAGES = Math.max(
  0,
  Number(process.env.GENERATION_MAX_HISTORY_MESSAGES) || 4
);

function assertEnv() {
  const missing = [];
  if (!GROQ_API_KEY) missing.push("GROQ_API_KEY");
  if (!PINECONE_API_KEY) missing.push("PINECONE_API_KEY");
  if (!PINECONE_INDEX_NAME) missing.push("PINECONE_INDEX_NAME");
  if (!FRONTEND_URL) missing.push("FRONTEND_URL");
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

module.exports = {
  PORT,
  GROQ_API_KEY,
  PINECONE_API_KEY,
  PINECONE_INDEX_NAME,
  PINECONE_CLOUD,
  PINECONE_REGION,
  FRONTEND_URL,
  EMBEDDING_DIMENSION,
  ENABLE_QUERY_REWRITE,
  QUERY_REWRITE_MODEL,
  QUERY_REWRITE_MAX_HISTORY_MESSAGES,
  RAG_DEBUG,
  ENABLE_HYBRID_RETRIEVAL,
  RETRIEVAL_TOP_K,
  DENSE_RETRIEVAL_WEIGHT,
  SPARSE_RETRIEVAL_WEIGHT,
  ENABLE_CHUNK_EVALUATOR,
  CHUNK_EVALUATOR_MODEL,
  RERANK_TOP_K,
  CHUNK_RELEVANCE_MIN_SCORE,
  RESPONSE_GENERATION_MODEL,
  ENABLE_INLINE_CITATIONS,
  GENERATION_MAX_HISTORY_MESSAGES,
  assertEnv,
};
