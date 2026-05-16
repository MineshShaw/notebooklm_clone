const { embedQuery } = require("./embeddingsService");
const { rewriteQueryForRetrieval } = require("./queryRewriteService");
const { hybridRetrieve } = require("./hybridRetrievalService");
const { evaluateChunkRelevance } = require("./chunkRelevanceService");
const {
  generateGroundedResponse,
  NOT_FOUND_MESSAGE,
} = require("./responseGenerationService");

const { RAG_DEBUG } = require("../utils/env");

/**
 * Attach full pipeline debug when RAG_DEBUG=true.
 * @param {object} payload
 * @param {object} pipeline
 */

function withRagDebug(payload, pipeline) {
  if (!RAG_DEBUG) return payload;

  const {
    rewriteResult,
    retrievalDebug,
    chunkEvalDebug,
    generationDebug,
  } = pipeline;

  return {
    ...payload,
    debug: {
      queryRewrite: {
        originalQuery: rewriteResult.originalQuery,
        rewrittenQuery: rewriteResult.rewrittenQuery,
        rewritten: rewriteResult.rewritten,
        skippedReason: rewriteResult.skippedReason,
        error: rewriteResult.error,
      },
      ...(retrievalDebug ? { retrieval: retrievalDebug } : {}),
      ...(chunkEvalDebug ? { chunkEvaluation: chunkEvalDebug } : {}),
      ...(generationDebug ? { generation: generationDebug } : {}),
    },
  };
}

/**
 * Version 2 RAG pipeline:
 * rewrite → hybrid retrieve → chunk evaluate → grounded generate.
 *
 * @param {string} question
 * @param {string[]} selectedFileIds
 * @param {Array<{ role: "user" | "assistant", content: string }>} [conversationHistory]
 */

async function chatWithDocuments(
  question,
  selectedFileIds,
  conversationHistory = [],
) {
  const trimmedQ = (question || "").trim();

  if (!trimmedQ) {
    throw new Error("Message is required.");
  }

  const ids = (selectedFileIds || []).filter(Boolean);

  if (!ids.length) {
    throw new Error("Select at least one uploaded document.");
  }

  const rewriteResult = await rewriteQueryForRetrieval({
    originalQuery: trimmedQ,
    conversationHistory,
  });

  const retrievalQuery = rewriteResult.rewrittenQuery;

  const vector = await embedQuery(retrievalQuery);

  const { chunks: retrieved, debug: retrievalDebug } = await hybridRetrieve({
    query: retrievalQuery,
    fileIds: ids,
    queryEmbedding: vector,
  });

  const candidates = retrieved.map((c) => ({
    fileId: c.fileId,
    fileName: c.fileName,
    chunkIndex: c.chunkIndex,
    text: c.text,
    score: typeof c.score === "number" ? c.score : undefined,
    denseScore: c.denseScore,
    bm25Score: c.bm25Score,
    retrievalSources: c.sources,
  }));

  if (!candidates.length) {
    return withRagDebug(
      { answer: NOT_FOUND_MESSAGE, sources: [] },
      { rewriteResult, retrievalDebug },
    );
  }

  const { chunks: filtered, debug: chunkEvalDebug } =
    await evaluateChunkRelevance({
      query: retrievalQuery,
      originalQuery: trimmedQ,
      candidates,
    });

  const sourcesForGeneration = filtered.map((c) => ({
    fileId: c.fileId,
    fileName: c.fileName,
    chunkIndex: c.chunkIndex,
    text: c.text,
    score: c.relevanceScore ?? c.score,
    relevanceScore: c.relevanceScore,
    relevanceReason: c.relevanceReason,
    denseScore: c.denseScore,
    bm25Score: c.bm25Score,
    retrievalSources: c.retrievalSources ?? c.sources,
  }));

  if (!sourcesForGeneration.length) {
    return withRagDebug(
      { answer: NOT_FOUND_MESSAGE, sources: [] },
      { rewriteResult, retrievalDebug, chunkEvalDebug },
    );
  }

  // Step 5: citation-structured context + grounded generation (third Groq call).

  const {
    answer,
    sources,
    debug: generationDebug,
  } = await generateGroundedResponse({
    question: trimmedQ,
    sources: sourcesForGeneration,
    conversationHistory,
  });

  return withRagDebug(
    { answer, sources },
    {
      rewriteResult,
      retrievalDebug,
      chunkEvalDebug,
      generationDebug,
    },
  );
}

module.exports = {
  chatWithDocuments,
  NOT_FOUND_MESSAGE,
};
