const { Groq } = require("groq-sdk");
const {
  GROQ_API_KEY,
  ENABLE_QUERY_REWRITE,
  QUERY_REWRITE_MODEL,
  RAG_DEBUG,
  QUERY_REWRITE_MAX_HISTORY_MESSAGES,
} = require("../utils/env");

/** @type {Groq | null} */
let groqClient = null;

function getGroqClient() {
  if (!groqClient) {
    groqClient = new Groq({ apiKey: GROQ_API_KEY });
  }
  return groqClient;
}

/**
 * @typedef {"user" | "assistant"} ChatRole
 * @typedef {{ role: ChatRole, content: string }} ConversationTurn
 */

/**
 * Normalize and cap conversation history for the rewriter prompt.
 * Keeps token use low on Groq free tier while preserving recent context.
 *
 * @param {unknown} raw
 * @returns {ConversationTurn[]}
 */
function normalizeHistory(raw) {
  if (!Array.isArray(raw)) return [];

  const turns = raw
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
      content: m.content.trim().slice(0, 2000),
    }));

  const max = QUERY_REWRITE_MAX_HISTORY_MESSAGES;
  return turns.slice(-max);
}

/**
 * Build the user message sent to the rewriter LLM.
 *
 * @param {string} originalQuery
 * @param {ConversationTurn[]} history
 */
function buildRewriterUserPrompt(originalQuery, history) {
  if (!history.length) {
    return `Latest user question (rewrite for document retrieval):\n${originalQuery}`;
  }

  const transcript = history
    .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`)
    .join("\n");

  return `Conversation so far:\n${transcript}\n\nLatest user question (rewrite for document retrieval):\n${originalQuery}`;
}

const REWRITER_SYSTEM_PROMPT = `You rewrite user questions into clear, standalone search queries for retrieving text chunks from uploaded documents.

Rules:
- Output ONLY the rewritten query — no quotes, labels, or explanation.
- Preserve the user's intent; do not invent facts or topics they did not imply.
- Expand vague references and pronouns (it, that, they, the second approach) using conversation history when provided.
- Make the query specific and keyword-rich enough for semantic search (names, concepts, technical terms).
- Keep it one or two sentences maximum.
- If the question is already clear and self-contained, return it unchanged or lightly clarified.`;

/**
 * Rewrite a user message into a retrieval-focused query.
 *
 * @param {object} params
 * @param {string} params.originalQuery - Raw user message (always preserved in the result).
 * @param {ConversationTurn[]} [params.conversationHistory] - Prior turns; assistant answers give context for pronouns.
 * @returns {Promise<{
 *   originalQuery: string,
 *   rewrittenQuery: string,
 *   rewritten: boolean,
 *   skippedReason?: string,
 *   error?: string,
 * }>}
 */
async function rewriteQueryForRetrieval({
  originalQuery,
  conversationHistory = [],
}) {
  const original = (originalQuery || "").trim();
  if (!original) {
    throw new Error("originalQuery is required for rewriting.");
  }

  // Feature flag — skip API call entirely when disabled (useful for debugging or rate limits).
  if (!ENABLE_QUERY_REWRITE) {
    return {
      originalQuery: original,
      rewrittenQuery: original,
      rewritten: false,
      skippedReason: "disabled_via_env",
    };
  }

  const history = normalizeHistory(conversationHistory);
  const userPrompt = buildRewriterUserPrompt(original, history);

  try {
    const groq = getGroqClient();
    const completion = await groq.chat.completions.create({
      model: QUERY_REWRITE_MODEL,
      temperature: 0,
      max_tokens: 256,
      messages: [
        { role: "system", content: REWRITER_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });

    const raw =
      completion.choices[0]?.message?.content?.trim() || "";

    // Guard: empty or suspiciously long model output → fall back to original query.
    const rewrittenQuery =
      raw && raw.length <= 2000 ? raw : original;

    const rewritten =
      rewrittenQuery.toLowerCase() !== original.toLowerCase();

    if (RAG_DEBUG) {
      console.log("[RAG query rewrite]", {
        originalQuery: original,
        rewrittenQuery,
        rewritten,
        historyTurns: history.length,
        model: QUERY_REWRITE_MODEL,
      });
    }

    return {
      originalQuery: original,
      rewrittenQuery,
      rewritten,
    };
  } catch (err) {
    // Fail open: retrieval still runs on the original query if Groq is down or rate-limited.
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[RAG query rewrite] failed, using original query:", message);

    if (RAG_DEBUG) {
      console.warn("[RAG query rewrite] error detail:", err);
    }

    return {
      originalQuery: original,
      rewrittenQuery: original,
      rewritten: false,
      skippedReason: "rewrite_api_error",
      error: message,
    };
  }
}

module.exports = {
  rewriteQueryForRetrieval,
  normalizeHistory,
};
