const BM25 = require("okapibm25").default;
const { queryByFileIds } = require("./pineconeService");
const { embedQuery } = require("./embeddingsService");
const { loadChunksForFileIds } = require("../utils/chunkTextStore");
const {
  ENABLE_HYBRID_RETRIEVAL,
  RETRIEVAL_TOP_K,
  DENSE_RETRIEVAL_WEIGHT,
  SPARSE_RETRIEVAL_WEIGHT,
  RAG_DEBUG,
} = require("../utils/env");

/**
 * Stable key for deduplicating chunks across dense and sparse lists.
 * @param {string} fileId
 * @param {number} chunkIndex
 */
function chunkKey(fileId, chunkIndex) {
  return `${fileId}::${chunkIndex}`;
}

/**
 * Tokenize text into BM25 query terms (lowercase alphanumeric words, len >= 2).
 * @param {string} text
 * @returns {string[]}
 */
function tokenizeForBm25(text) {
  const tokens = (String(text).toLowerCase().match(/\b[a-z0-9]{2,}\b/g) || []);
  return [...new Set(tokens)];
}

/**
 * Min–max normalize scores to [0, 1]. Equal scores → all 1 (treat as equally relevant).
 * @param {number[]} scores
 * @returns {number[]}
 */
function minMaxNormalize(scores) {
  if (!scores.length) return [];
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  if (max === min) return scores.map(() => 1);
  return scores.map((s) => (s - min) / (max - min));
}

/**
 * Map Pinecone matches to a normalized internal shape.
 * @param {import("@pinecone-database/pinecone").ScoredPineconeRecord[]} matches
 */
function mapDenseMatches(matches) {
  return (matches || []).map((m) => {
    const md = m.metadata || {};
    const fileId = String(md.fileId ?? "");
    const chunkIndex =
      typeof md.chunkIndex === "number"
        ? md.chunkIndex
        : Number(md.chunkIndex) || 0;
    return {
      fileId,
      fileName: String(md.fileName ?? ""),
      chunkIndex,
      text: String(md.text ?? ""),
      denseScore: typeof m.score === "number" ? m.score : 0,
      bm25Score: 0,
      score: typeof m.score === "number" ? m.score : 0,
      sources: ["dense"],
    };
  }).filter((r) => r.text && r.fileId);
}

/**
 * Run BM25 over local chunk corpus for selected files.
 *
 * @param {string} query
 * @param {Array<{ fileId: string, fileName: string, chunkIndex: number, text: string }>} corpus
 * @param {number} topK
 */
function bm25Retrieve(query, corpus, topK) {
  const keywords = tokenizeForBm25(query);
  if (!keywords.length || !corpus.length) {
    return [];
  }

  const documents = corpus.map((c) => c.text);
  const rawScores = BM25(documents, keywords, { k1: 1.2, b: 0.75 });

  const ranked = corpus
    .map((chunk, i) => ({
      ...chunk,
      bm25Score: typeof rawScores[i] === "number" ? rawScores[i] : 0,
    }))
    .filter((r) => r.bm25Score > 0)
    .sort((a, b) => b.bm25Score - a.bm25Score)
    .slice(0, topK);

  return ranked.map((r) => ({
    fileId: r.fileId,
    fileName: r.fileName,
    chunkIndex: r.chunkIndex,
    text: r.text,
    denseScore: 0,
    bm25Score: r.bm25Score,
    score: r.bm25Score,
    sources: ["bm25"],
  }));
}

/**
 * Fuse dense and sparse ranked lists with configurable weights.
 *
 * @param {ReturnType<typeof mapDenseMatches>} denseResults
 * @param {ReturnType<typeof bm25Retrieve>} sparseResults
 * @param {{ denseWeight: number, sparseWeight: number }} weights
 * @param {number} topK
 */
function fuseRetrievalResults(denseResults, sparseResults, weights, topK) {
  const { denseWeight, sparseWeight } = weights;
  const byKey = new Map();

  const denseNorm = minMaxNormalize(denseResults.map((r) => r.denseScore));
  denseResults.forEach((r, i) => {
    const key = chunkKey(r.fileId, r.chunkIndex);
    byKey.set(key, {
      ...r,
      denseNorm: denseNorm[i] ?? 0,
      sparseNorm: 0,
      sources: ["dense"],
    });
  });

  const sparseNorm = minMaxNormalize(sparseResults.map((r) => r.bm25Score));
  sparseResults.forEach((r, i) => {
    const key = chunkKey(r.fileId, r.chunkIndex);
    const existing = byKey.get(key);
    const norm = sparseNorm[i] ?? 0;
    if (existing) {
      existing.sparseNorm = norm;
      existing.bm25Score = r.bm25Score;
      if (!existing.sources.includes("bm25")) existing.sources.push("bm25");
    } else {
      byKey.set(key, {
        fileId: r.fileId,
        fileName: r.fileName,
        chunkIndex: r.chunkIndex,
        text: r.text,
        denseScore: 0,
        bm25Score: r.bm25Score,
        denseNorm: 0,
        sparseNorm: norm,
        sources: ["bm25"],
      });
    }
  });

  const hasDense = denseResults.length > 0;
  const hasSparse = sparseResults.length > 0;
  let wDense = denseWeight;
  let wSparse = sparseWeight;
  if (hasDense && !hasSparse) {
    wDense = 1;
    wSparse = 0;
  } else if (!hasDense && hasSparse) {
    wDense = 0;
    wSparse = 1;
  } else if (hasDense && hasSparse) {
    const sum = wDense + wSparse;
    wDense = wDense / sum;
    wSparse = wSparse / sum;
  }

  const fused = [...byKey.values()]
    .map((r) => {
      const fusedScore = wDense * r.denseNorm + wSparse * r.sparseNorm;
      return {
        fileId: r.fileId,
        fileName: r.fileName,
        chunkIndex: r.chunkIndex,
        text: r.text,
        score: fusedScore,
        denseScore: r.denseScore,
        bm25Score: r.bm25Score,
        sources: r.sources,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return fused;
}

/**
 * Main retrieval entry: embed query (optional), dense search, optional BM25 + fusion.
 *
 * @param {object} params
 * @param {string} params.query - Rewritten retrieval query
 * @param {string[]} params.fileIds - Selected document IDs
 * @param {number[]} [params.queryEmbedding] - Precomputed embedding (avoids double embed)
 * @returns {Promise<{ chunks: Array<object>, debug: object }>}
 */
async function hybridRetrieve({ query, fileIds, queryEmbedding }) {
  const topK = RETRIEVAL_TOP_K;
  const vector =
    queryEmbedding && queryEmbedding.length
      ? queryEmbedding
      : await embedQuery(query);

  const denseMatches = await queryByFileIds(vector, fileIds, topK);
  const denseResults = mapDenseMatches(denseMatches);

  if (!ENABLE_HYBRID_RETRIEVAL) {
    const debug = {
      mode: "dense_only",
      topK,
      denseCount: denseResults.length,
    };
    if (RAG_DEBUG) console.log("[RAG retrieval]", debug);
    return { chunks: denseResults, debug };
  }

  const corpus = await loadChunksForFileIds(fileIds);
  const sparseResults = bm25Retrieve(query, corpus, topK);

  const chunks = fuseRetrievalResults(
    denseResults,
    sparseResults,
    {
      denseWeight: DENSE_RETRIEVAL_WEIGHT,
      sparseWeight: SPARSE_RETRIEVAL_WEIGHT,
    },
    topK
  );

  const debug = {
    mode: corpus.length ? "hybrid" : "hybrid_dense_only_no_local_chunks",
    topK,
    denseCount: denseResults.length,
    sparseCount: sparseResults.length,
    corpusChunkCount: corpus.length,
    fusedCount: chunks.length,
    weights: {
      dense: DENSE_RETRIEVAL_WEIGHT,
      sparse: SPARSE_RETRIEVAL_WEIGHT,
    },
    topChunks: chunks.slice(0, 5).map((c) => ({
      fileId: c.fileId,
      chunkIndex: c.chunkIndex,
      score: Number(c.score?.toFixed(4)),
      sources: c.sources,
    })),
  };

  if (RAG_DEBUG) {
    console.log("[RAG retrieval]", debug);
  }

  return { chunks, debug };
}

module.exports = {
  hybridRetrieve,
  tokenizeForBm25,
  fuseRetrievalResults,
  chunkKey,
};
