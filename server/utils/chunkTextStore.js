const fs = require("fs/promises");
const path = require("path");

const CHUNKS_DIR = path.join(__dirname, "..", "data", "chunks");

async function ensureChunksDir() {
  await fs.mkdir(CHUNKS_DIR, { recursive: true });
}

/**
 * @param {string} fileId
 * @returns {string}
 */
function chunkFilePath(fileId) {
  return path.join(CHUNKS_DIR, `${fileId}.json`);
}

/**
 * Persist all chunks for a document (called during upload indexing).
 *
 * @param {string} fileId
 * @param {string} fileName
 * @param {string[]} chunkTexts
 */
async function saveChunksForFile(fileId, fileName, chunkTexts) {
  await ensureChunksDir();
  const payload = {
    fileId,
    fileName,
    savedAt: new Date().toISOString(),
    chunks: chunkTexts.map((text, chunkIndex) => ({
      chunkIndex,
      text,
    })),
  };
  await fs.writeFile(chunkFilePath(fileId), JSON.stringify(payload), "utf8");
}

/**
 * Load chunk records for multiple files (for BM25 over selected documents).
 *
 * @param {string[]} fileIds
 * @returns {Promise<Array<{ fileId: string, fileName: string, chunkIndex: number, text: string }>>}
 */
async function loadChunksForFileIds(fileIds) {
  const ids = [...new Set((fileIds || []).filter(Boolean))];
  const records = [];

  for (const fileId of ids) {
    try {
      const raw = await fs.readFile(chunkFilePath(fileId), "utf8");
      const parsed = JSON.parse(raw);
      const fileName = String(parsed.fileName ?? "document");
      const chunks = Array.isArray(parsed.chunks) ? parsed.chunks : [];
      for (const c of chunks) {
        const text = String(c.text ?? "").trim();
        if (!text) continue;
        records.push({
          fileId,
          fileName,
          chunkIndex:
            typeof c.chunkIndex === "number"
              ? c.chunkIndex
              : Number(c.chunkIndex) || 0,
          text,
        });
      }
    } catch (err) {
      if (err && err.code === "ENOENT") {
        // File indexed before BM25 store existed — hybrid retrieval skips lexical leg.
        continue;
      }
      throw err;
    }
  }

  return records;
}

/**
 * Remove local chunk file when a document is deleted.
 * @param {string} fileId
 */
async function deleteChunksForFile(fileId) {
  try {
    await fs.unlink(chunkFilePath(fileId));
  } catch (err) {
    if (err && err.code !== "ENOENT") throw err;
  }
}

module.exports = {
  CHUNKS_DIR,
  saveChunksForFile,
  loadChunksForFileIds,
  deleteChunksForFile,
};
