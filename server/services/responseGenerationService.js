const { Groq } = require("groq-sdk");
const {
  GROQ_API_KEY,
  RESPONSE_GENERATION_MODEL,
  ENABLE_INLINE_CITATIONS,
  GENERATION_MAX_HISTORY_MESSAGES,
  RAG_DEBUG,
} = require("../utils/env");

const NOT_FOUND_MESSAGE =
  "I could not find that information in the uploaded documents.";

/** @type {Groq | null} */
let groqClient = null;

function getGroqClient() {
  if (!groqClient) {
    groqClient = new Groq({ apiKey: GROQ_API_KEY });
  }
  return groqClient;
}

/**
 * @typedef {object} SourceForGeneration
 * @property {string} fileId
 * @property {string} fileName
 * @property {number} chunkIndex
 * @property {string} text
 * @property {number} [citationId]
 * @property {number} [relevanceScore]
 * @property {string} [relevanceReason]
 */

/**
 * Assign stable citation numbers [1]..[N] aligned with context blocks and API sources.
 *
 * @param {SourceForGeneration[]} sources
 * @returns {SourceForGeneration[]}
 */
function assignCitationIds(sources) {
  return sources.map((s, index) => ({
    ...s,
    citationId: index + 1,
  }));
}

/**
 * Build structured context so the model can map claims → citation IDs.
 *
 * @param {SourceForGeneration[]} sources
 */
function buildCitationContext(sources) {
  return sources
    .map((s) => {
      const meta = [
        `citation_id: ${s.citationId}`,
        `file_name: ${s.fileName}`,
        `file_id: ${s.fileId}`,
        `chunk_index: ${s.chunkIndex}`,
      ];
      if (typeof s.relevanceScore === "number") {
        meta.push(`relevance_score: ${s.relevanceScore}/10`);
      }
      return `[Citation ${s.citationId}]\n${meta.join("\n")}\n---\n${s.text}`;
    })
    .join("\n\n=====\n\n");
}

/**
 * @param {unknown} raw
 * @returns {Array<{ role: "user" | "assistant", content: string }>}
 */
function normalizeGenerationHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (m) =>
        m &&
        typeof m === "object" &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim()
    )
    .map((m) => ({
      role: m.role,
      content: m.content.trim().slice(0, 1500),
    }))
    .slice(-GENERATION_MAX_HISTORY_MESSAGES);
}

/**
 * @param {boolean} inlineCitations
 */
function buildSystemPrompt(inlineCitations) {
  const citationRules = inlineCitations
    ? `- After each factual claim drawn from context, add an inline citation marker using the citation_id, e.g. [1] or [2].
- Only use citation IDs that appear in the provided context.
- Do not fabricate citations or cite IDs without supporting text in that chunk.`
    : `- Base every factual statement on the provided context chunks.`;

  return `You are a careful document assistant for a NotebookLM-style RAG system.

Your job is to answer the user's question using ONLY the provided citation blocks.

Grounding rules:
- Use only information explicitly supported by the citation blocks.
- Do not use outside knowledge, assumptions, or world facts not present in the blocks.
- If the blocks do not contain enough information to answer, respond with exactly:
${NOT_FOUND_MESSAGE}
- If partially answerable, answer only the supported part and state what is missing.
${citationRules}
- Prefer clear, concise prose. Use markdown lists or short paragraphs when helpful.
- Do not mention "citation blocks", "chunks", or "RAG" in the answer — write for the end user.`;
}

/**
 * @param {object} params
 * @param {string} params.question
 * @param {string} params.context
 * @param {Array<{ role: string, content: string }>} params.history
 */
function buildUserPrompt({ question, context, history }) {
  const historyBlock =
    history.length > 0
      ? `Recent conversation (for disambiguation only — facts must still come from citations):\n${history
          .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`)
          .join("\n")}\n\n`
      : "";

  return `${historyBlock}Citation context (sole source of truth):

${context}

---

User question: ${question}

Answer:`;
}

/**
 * Parse [1], [2] markers from the model answer for UI highlighting.
 *
 * @param {string} answer
 * @returns {Set<number>}
 */
function extractCitedIds(answer) {
  const cited = new Set();
  const re = /\[(\d+)\]/g;
  let match;
  while ((match = re.exec(answer)) !== null) {
    const id = Number(match[1]);
    if (Number.isFinite(id) && id > 0) cited.add(id);
  }
  return cited;
}

/**
 * Mark which sources the model referenced inline.
 *
 * @param {string} answer
 * @param {SourceForGeneration[]} sources
 */
function attachCitationUsage(answer, sources) {
  const citedIds = extractCitedIds(answer);
  return sources.map((s) => ({
    ...s,
    citedInAnswer: citedIds.has(s.citationId),
  }));
}

/**
 * Generate a grounded answer from filtered, citation-numbered sources.
 *
 * @param {object} params
 * @param {string} params.question - Original user question
 * @param {SourceForGeneration[]} params.sources - Post-rerank chunks
 * @param {Array<{ role: "user" | "assistant", content: string }>} [params.conversationHistory]
 * @returns {Promise<{
 *   answer: string,
 *   sources: SourceForGeneration[],
 *   debug: object,
 * }>}
 */
async function generateGroundedResponse({
  question,
  sources,
  conversationHistory = [],
}) {
  const trimmedQ = (question || "").trim();
  if (!trimmedQ) {
    throw new Error("Question is required for generation.");
  }
  if (!sources.length) {
    return {
      answer: NOT_FOUND_MESSAGE,
      sources: [],
      debug: { skipped: true, reason: "no_sources" },
    };
  }

  const numberedSources = assignCitationIds(sources);
  const context = buildCitationContext(numberedSources);
  const history = normalizeGenerationHistory(conversationHistory);
  const inlineCitations = ENABLE_INLINE_CITATIONS;

  const messages = [
    { role: "system", content: buildSystemPrompt(inlineCitations) },
    {
      role: "user",
      content: buildUserPrompt({
        question: trimmedQ,
        context,
        history,
      }),
    },
  ];

  const groq = getGroqClient();
  const completion = await groq.chat.completions.create({
    model: RESPONSE_GENERATION_MODEL,
    temperature: 0,
    max_tokens: 2048,
    messages,
  });

  const rawAnswer =
    completion.choices[0]?.message?.content?.trim() || NOT_FOUND_MESSAGE;

  const answer =
    rawAnswer.length > 0 ? rawAnswer : NOT_FOUND_MESSAGE;

  const sourcesWithUsage = attachCitationUsage(answer, numberedSources);

  const debug = {
    model: RESPONSE_GENERATION_MODEL,
    inlineCitations,
    contextCitationCount: numberedSources.length,
    historyTurns: history.length,
    citedIds: [...extractCitedIds(answer)],
    promptCharCount: messages.reduce((n, m) => n + m.content.length, 0),
  };

  if (RAG_DEBUG) {
    console.log("[RAG generation]", debug);
  }

  return {
    answer,
    sources: sourcesWithUsage,
    debug,
  };
}

module.exports = {
  generateGroundedResponse,
  assignCitationIds,
  buildCitationContext,
  extractCitedIds,
  attachCitationUsage,
  NOT_FOUND_MESSAGE,
};
