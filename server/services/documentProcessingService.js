const fs = require("fs/promises");
const path = require("path");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

const { v4: uuidv4 } = require("uuid");
const { chunkText } = require("./chunkingService");
const { embedDocuments } = require("./embeddingsService");
const { upsertVectors } = require("./pineconeService");
const { saveChunksForFile } = require("../utils/chunkTextStore");

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

  if (lower.includes("word") || ext === ".docx") {
    const result = await mammoth.extractRawText({ path: filePath });

    return (result.value || "").trim();
  }

  if (lower.includes("csv") || ext === ".csv") {

    const raw = await fs.readFile(filePath, "utf8");

    const normalized = raw
      .split("\n")
      .map(line => line.replace(/,/g, " "))
      .join("\n");

    return normalized.trim();
  }

  throw new Error(
    "Unsupported file type. Allowed: PDF, TXT, DOCX, CSV"
  );
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

  // Local copy for BM25 — Pinecone holds vectors only; lexical search needs raw text.
  await saveChunksForFile(fileId, input.originalName, chunks);

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
