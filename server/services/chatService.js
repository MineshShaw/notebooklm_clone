const { Groq } = require("groq-sdk");
const { embedQuery } = require("./embeddingsService");
const { queryByFileIds } = require("./pineconeService");
const { GROQ_API_KEY } = require("../utils/env");

const NOT_FOUND_MESSAGE =
  "I could not find that information in the uploaded documents.";

function getClient() {
  return new Groq({
    apiKey: GROQ_API_KEY,
  });
}

/**
 * @param {string} question
 * @param {string[]} selectedFileIds
 */
async function chatWithDocuments(question, selectedFileIds) {
  const trimmedQ = (question || "").trim();
  if (!trimmedQ) {
    throw new Error("Message is required.");
  }
  const ids = (selectedFileIds || []).filter(Boolean);
  if (!ids.length) {
    throw new Error("Select at least one uploaded document.");
  }

  const vector = await embedQuery(trimmedQ);
  const matches = await queryByFileIds(vector, ids, 12);

  const sources = (matches || []).map((m) => {
    const md = m.metadata || {};
    return {
      fileId: String(md.fileId ?? ""),
      fileName: String(md.fileName ?? ""),
      chunkIndex:
        typeof md.chunkIndex === "number" ? md.chunkIndex : Number(md.chunkIndex),
      text: String(md.text ?? ""),
      score: typeof m.score === "number" ? m.score : undefined,
    };
  }).filter((s) => s.text);

  if (!sources.length) {
    return {
      answer: NOT_FOUND_MESSAGE,
      sources: [],
    };
  }

  const contextBlocks = sources.map((s, i) => {
    return `[Source ${i + 1}] File: ${s.fileName} | Chunk: ${s.chunkIndex}\n${s.text}`;
  });
  const context = contextBlocks.join("\n\n---\n\n");

  const systemPrompt = `You are a document assistant.

Answer ONLY using the provided context below.

Rules:
- Do not use outside knowledge.
- If the answer cannot be found in the context, respond with exactly:
${NOT_FOUND_MESSAGE}
- Quote or paraphrase only what is supported by the context.`;

  const userPrompt = `Context from uploaded documents:

${context}

Question: ${trimmedQ}`;

  const groq = getClient();
  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    temperature: 0,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const answer =
    completion.choices[0]?.message?.content?.trim() || NOT_FOUND_MESSAGE;

  return {
    answer,
    sources,
  };
}

module.exports = {
  chatWithDocuments,
  NOT_FOUND_MESSAGE,
};
