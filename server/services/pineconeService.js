const { Pinecone } = require("@pinecone-database/pinecone");
const {
  PINECONE_API_KEY,
  PINECONE_INDEX_NAME,
  PINECONE_CLOUD,
  PINECONE_REGION,
  EMBEDDING_DIMENSION,
} = require("../utils/env");

let pineconeClient = null;
let indexReadyPromise = null;

function getClient() {
  if (!pineconeClient) {
    pineconeClient = new Pinecone({ apiKey: PINECONE_API_KEY });
  }
  return pineconeClient;
}

/**
 * Creates the serverless index if missing, then waits until status.ready.
 */
async function ensureIndexReady() {
  if (indexReadyPromise) return indexReadyPromise;

  indexReadyPromise = (async () => {
    const pc = getClient();
    const listed = await pc.listIndexes();
    const names = (listed.indexes || []).map((i) => i.name);
    if (!names.includes(PINECONE_INDEX_NAME)) {
      await pc.createIndex({
        name: PINECONE_INDEX_NAME,
        dimension: EMBEDDING_DIMENSION,
        metric: "cosine",
        spec: {
          serverless: {
            cloud: PINECONE_CLOUD,
            region: PINECONE_REGION,
          },
        },
        deletionProtection: "disabled",
      });
    }

    for (let i = 0; i < 60; i += 1) {
      const desc = await pc.describeIndex(PINECONE_INDEX_NAME);
      if (desc.status?.ready) return;
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error("Pinecone index did not become ready in time.");
  })();

  return indexReadyPromise;
}

function getIndex() {
  const pc = getClient();
  return pc.index(PINECONE_INDEX_NAME);
}

/**
 * @param {Array<{ id: string, values: number[], metadata: Record<string, unknown> }>} vectors
 */
async function upsertVectors(vectors) {
  await ensureIndexReady();
  const index = getIndex();
  const batchSize = 100;
  for (let i = 0; i < vectors.length; i += batchSize) {
    const slice = vectors.slice(i, i + batchSize);
    await index.upsert(slice);
  }
}

/**
 * @param {number[]} vector
 * @param {string[]} fileIds
 * @param {number} topK
 */
async function queryByFileIds(vector, fileIds, topK = 8) {
  await ensureIndexReady();
  const index = getIndex();
  const filter =
    fileIds.length === 1
      ? { fileId: { $eq: fileIds[0] } }
      : { fileId: { $in: fileIds } };

  const res = await index.query({
    vector,
    topK,
    includeMetadata: true,
    filter,
  });

  return res.matches || [];
}

/**
 * Delete all vectors for a single fileId (metadata filter).
 * @param {string} fileId
 */
async function deleteByFileId(fileId) {
  await ensureIndexReady();
  const index = getIndex();
  await index.deleteMany({ fileId: { $eq: fileId } });
}

module.exports = {
  ensureIndexReady,
  upsertVectors,
  queryByFileIds,
  deleteByFileId,
};
