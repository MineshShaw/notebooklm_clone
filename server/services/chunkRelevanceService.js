const { Groq } = require("groq-sdk");
const {
  GROQ_API_KEY,
  ENABLE_CHUNK_EVALUATOR,
  CHUNK_EVALUATOR_MODEL,
  RERANK_TOP_K,
  CHUNK_RELEVANCE_MIN_SCORE,
  RAG_DEBUG,
} = require("../utils/env");

/** Max characters of chunk text sent to the evaluator (token control). */
const CHUNK_TEXT_PREVIEW_LENGTH = 700;

/** @type {Groq | null} */
let groqClient = null;

function getGroqClient() {
  if (!groqClient) {
    groqClient = new Groq({ apiKey: GROQ_API_KEY });
  }
  return groqClient;
}

/**
 * @typedef {object} CandidateChunk
 * @property {string} fileId
 * @property {string} fileName
 * @property {number} chunkIndex
 * @property {string} text
 * @property {number} [score]
 * @property {number} [denseScore]
 * @property {number} [bm25Score]
 * @property {string[]} [sources]
 * @property {string[]} [retrievalSources]
 */

const EVALUATOR_SYSTEM_PROMPT = `You are a retrieval relevance judge for a RAG system.

Given a user question and numbered candidate text chunks, score how useful each chunk is for answering the question.

Rules:
- Score each chunk from 0 (irrelevant) to 10 (directly answers or strongly supports).
- Return ONLY valid JSON matching this schema (no markdown):
{
  "ranked_chunks": [
    { "chunk_id": 0, "score": 9, "reason": "brief explanation" }
  ]
}
- Include every chunk_id exactly once, sorted by score descending.
- Be strict: tangential or off-topic chunks should score 5 or below.
- Do not invent information not present in the chunks.`;

/**
 * Truncate chunk body for the evaluator prompt.
 * @param {string} text
 */
function previewChunkText(text) {
  const t = String(text || "").trim();
  if (t.length <= CHUNK_TEXT_PREVIEW_LENGTH) return t;
  return `${t.slice(0, CHUNK_TEXT_PREVIEW_LENGTH)}…`;
}

/**
 * Build the user prompt listing all candidates with stable numeric chunk_id.
 *
 * @param {string} query
 * @param {string} originalQuery
 * @param {CandidateChunk[]} candidates
 */
function buildEvaluatorUserPrompt(query, originalQuery, candidates) {
  const blocks = candidates.map((c, chunkId) => {
    return `[chunk_id: ${chunkId}]
file: ${c.fileName} (chunk index ${c.chunkIndex})
text:
${previewChunkText(c.text)}`;
  });

  return `User question (for judging relevance):
${originalQuery}

Retrieval-focused query (for context):
${query}

Candidate chunks:
${blocks.join("\n\n")}`;
}

/**
 * Strip markdown code fences if the model wraps JSON.
 * @param {string} raw
 */
function extractJsonString(raw) {
  const trimmed = (raw || "").trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  return trimmed;
}

/**
 * @param {unknown} parsed
 * @returns {Array<{ chunk_id: number, score: number, reason: string }>}
 */
function parseRankedChunks(parsed) {
  if (!parsed || typeof parsed !== "object") return [];
  const list = /** @type {{ ranked_chunks?: unknown }} */ (parsed).ranked_chunks;
  if (!Array.isArray(list)) return [];

  return list
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = /** @type {{ chunk_id?: unknown, score?: unknown, reason?: unknown }} */ (
        item
      );
      const chunk_id = Number(row.chunk_id);
      const score = Number(row.score);
      if (!Number.isFinite(chunk_id) || chunk_id < 0) return null;
      if (!Number.isFinite(score)) return null;
      return {
        chunk_id: Math.floor(chunk_id),
        score: Math.max(0, Math.min(10, score)),
        reason: String(row.reason ?? "").trim(),
      };
    })
    .filter(Boolean);
}

/**
 * Keep top chunks after LLM scores; attach relevance metadata.
 *
 * @param {CandidateChunk[]} candidates
 * @param {Array<{ chunk_id: number, score: number, reason: string }>} ranked
 * @param {number} topK
 * @param {number} minScore
 */
function applyRanking(candidates, ranked, topK, minScore) {
  const byId = new Map(ranked.map((r) => [r.chunk_id, r]));

  const scored = candidates.map((chunk, chunkId) => {
    const evalRow = byId.get(chunkId);
    return {
      chunk,
      chunkId,
      relevanceScore: evalRow?.score ?? 0,
      relevanceReason: evalRow?.reason ?? "",
    };
  });

  const kept = scored
    .filter((s) => s.relevanceScore >= minScore)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, topK);

  const keptIds = new Set(kept.map((k) => k.chunkId));
  const discarded = scored
    .filter((s) => !keptIds.has(s.chunkId))
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .map((s) => ({
      chunk_id: s.chunkId,
      fileId: s.chunk.fileId,
      chunkIndex: s.chunk.chunkIndex,
      relevanceScore: s.relevanceScore,
      reason: s.relevanceReason,
    }));

  const filteredChunks = kept.map((k) => ({
    ...k.chunk,
    score: k.relevanceScore,
    relevanceScore: k.relevanceScore,
    relevanceReason: k.relevanceReason,
  }));

  return { filteredChunks, discarded, ranked: scored };
}

/**
 * Fallback when evaluator is off or fails: slice by retrieval fusion score.
 *
 * @param {CandidateChunk[]} candidates
 * @param {number} topK
 */
function fallbackByRetrievalScore(candidates, topK) {
  const sorted = [...candidates].sort(
    (a, b) => (b.score ?? 0) - (a.score ?? 0)
  );
  return sorted.slice(0, topK).map((c) => ({
    ...c,
    relevanceScore: c.score,
    relevanceReason: "kept_by_retrieval_score_fallback",
  }));
}

/**
 * Evaluate all candidate chunks in one Groq call; return filtered list for generation.
 *
 * @param {object} params
 * @param {string} params.query - Rewritten retrieval query
 * @param {string} params.originalQuery - Raw user question
 * @param {CandidateChunk[]} params.candidates
 * @returns {Promise<{
 *   chunks: CandidateChunk[],
 *   debug: object,
 * }>}
 */
async function evaluateChunkRelevance({ query, originalQuery, candidates }) {
  const topK = RERANK_TOP_K;
  const minScore = CHUNK_RELEVANCE_MIN_SCORE;

  if (!candidates.length) {
    return {
      chunks: [],
      debug: { mode: "no_candidates", keptCount: 0, discardedCount: 0 },
    };
  }

  if (!ENABLE_CHUNK_EVALUATOR) {
    const chunks = fallbackByRetrievalScore(candidates, topK);
    const debug = {
      mode: "disabled_via_env",
      keptCount: chunks.length,
      discardedCount: Math.max(0, candidates.length - chunks.length),
    };
    if (RAG_DEBUG) console.log("[RAG chunk evaluator]", debug);
    return { chunks, debug };
  }

  try {
    const groq = getGroqClient();
    const completion = await groq.chat.completions.create({
      model: CHUNK_EVALUATOR_MODEL,
      temperature: 0,
      max_tokens: 2048,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: EVALUATOR_SYSTEM_PROMPT },
        {
          role: "user",
          content: buildEvaluatorUserPrompt(query, originalQuery, candidates),
        },
      ],
    });

    const rawContent = completion.choices[0]?.message?.content || "";
    const parsed = JSON.parse(extractJsonString(rawContent));
    const ranked = parseRankedChunks(parsed);

    if (!ranked.length) {
      throw new Error("Evaluator returned no ranked_chunks.");
    }

    let { filteredChunks, discarded } = applyRanking(
      candidates,
      ranked,
      topK,
      minScore
    );

    // If the model was too strict, keep at least the top retrieval hits.
    if (!filteredChunks.length) {
      filteredChunks = fallbackByRetrievalScore(candidates, Math.min(3, topK));
      discarded = candidates.map((c, chunk_id) => ({
        chunk_id,
        fileId: c.fileId,
        chunkIndex: c.chunkIndex,
        relevanceScore: 0,
        reason: "below_min_score",
      }));
    }

    const debug = {
      mode: "llm_evaluator",
      model: CHUNK_EVALUATOR_MODEL,
      candidateCount: candidates.length,
      keptCount: filteredChunks.length,
      discardedCount: discarded.length,
      minScore,
      topK,
      rankedPreview: ranked.slice(0, 8).map((r) => ({
        chunk_id: r.chunk_id,
        score: r.score,
        reason: r.reason,
      })),
      discarded,
    };

    if (RAG_DEBUG) {
      console.log("[RAG chunk evaluator]", {
        ...debug,
        discarded: debug.discarded.slice(0, 10),
      });
    }

    return { chunks: filteredChunks, debug };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[RAG chunk evaluator] failed, using retrieval fallback:", message);

    const chunks = fallbackByRetrievalScore(candidates, topK);
    const debug = {
      mode: "fallback_retrieval_score",
      error: message,
      keptCount: chunks.length,
      discardedCount: Math.max(0, candidates.length - chunks.length),
    };

    if (RAG_DEBUG) console.warn("[RAG chunk evaluator] debug:", debug);

    return { chunks, debug };
  }
}

module.exports = {
  evaluateChunkRelevance,
  previewChunkText,
  parseRankedChunks,
  applyRanking,
  fallbackByRetrievalScore,
};
