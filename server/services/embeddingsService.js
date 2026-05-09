const { env } = require("@huggingface/transformers");

// Use local embeddings with Transformers.js
let embeddingModel = null;

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

async function initializeEmbeddingModel() {
  if (embeddingModel) {
    return;
  }
  
  console.log("Loading embedding model...");
  env.allowLocalModels = true;
  env.allowRemoteModels = true;
  
  // Load model
  const { pipeline } = await import("@xenova/transformers");
  embeddingModel = await pipeline("feature-extraction", MODEL_ID);
  
  console.log("Embedding model ready");
}

/**
 * @param {string[]} texts
 */
async function embedDocuments(texts) {
  await initializeEmbeddingModel();
  
  try {
    const embeddings = await Promise.all(
      texts.map(async (text) => {
        const result = await embeddingModel(text, {
          pooling: "mean",
          normalize: true,
        });
        return Array.from(result.data);
      })
    );
    return embeddings;
  } catch (error) {
    console.error("Error embedding documents:", error);
    throw error;
  }
}

/**
 * @param {string} text
 */
async function embedQuery(text) {
  await initializeEmbeddingModel();
  
  try {
    const result = await embeddingModel(text, {
      pooling: "mean",
      normalize: true,
    });
    return Array.from(result.data);
  } catch (error) {
    console.error("Error embedding query:", error);
    throw error;
  }
}

module.exports = {
  embedDocuments,
  embedQuery,
};
