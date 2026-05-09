const fs = require("fs/promises");
const path = require("path");
const pdfParse = require("pdf-parse");
const { v4: uuidv4 } = require("uuid");
const { chunkText } = require("./chunkingService");
const { embedDocuments } = require("./embeddingsService");
const { upsertVectors } = require("./pineconeService");

/**
 * @param {string} filePath
 * @param {string} mimeOrExt
 */
async function extractTextFromFile(filePath, mimeOrExt) {
  const lower = (mimeOrExt || "").toLowerCase();
  const ext = path.extname(filePath).toLowerCase();
  if (lower.includes("pdf") || ext === ".pdf") {
    const buf = await fs.readFile(filePath);
    const data = await pdfParse(buf);
    return (data.text || "").trim();
  }
  if (lower.includes("text") || ext === ".txt") {
    return (await fs.readFile(filePath, "utf8")).trim();
  }
  throw new Error("Unsupported file type. Only PDF and TXT are allowed.");
}

/**
 * Process upload: chunk, embed, upsert to Pinecone.
 * @param {{ filePath: string, originalName: string, mimeType: string }} input
 * @returns {Promise<{ fileId: string, fileName: string, uploadDate: string, chunkCount: number }>}
 */
async function processAndIndexDocument(input) {
  const fileId = uuidv4();
  const text = await extractTextFromFile(input.filePath, input.mimeType);
  if (!text) {
    throw new Error("Could not extract text from the file (empty document).");
  }

  const chunks = await chunkText(text);
  if (!chunks.length) {
    throw new Error("No text chunks produced from document.");
  }

  const embeddings = await embedDocuments(chunks);

  const vectors = chunks.map((chunkTextItem, chunkIndex) => ({
    id: `${fileId}_${chunkIndex}`,
    values: embeddings[chunkIndex],
    metadata: {
      fileId,
      fileName: input.originalName,
      chunkIndex,
      text: chunkTextItem,
    },
  }));

  await upsertVectors(vectors);

  const uploadDate = new Date().toISOString();

  return {
    fileId,
    fileName: input.originalName,
    uploadDate,
    chunkCount: chunks.length,
  };
}

module.exports = {
  extractTextFromFile,
  processAndIndexDocument,
};
