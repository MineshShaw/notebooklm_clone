const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 500,
  chunkOverlap: 100,
});

/**
 * @param {string} text
 * @returns {Promise<string[]>}
 */
async function chunkText(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return [];
  const chunks = await splitter.splitText(trimmed);
  return chunks.map((c) => c.trim()).filter(Boolean);
}

module.exports = {
  chunkText,
};
