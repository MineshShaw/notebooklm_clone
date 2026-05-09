require("dotenv").config();

const PORT = Number(process.env.PORT) || 3001;
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const PINECONE_API_KEY = process.env.PINECONE_API_KEY || "";
const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME || "";
const PINECONE_CLOUD = process.env.PINECONE_CLOUD || "aws";
const PINECONE_REGION = process.env.PINECONE_REGION || "us-east-1";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

/** Dimension for all-MiniLM-L6-v2 embeddings */
const EMBEDDING_DIMENSION = 384;

function assertEnv() {
  const missing = [];
  if (!GROQ_API_KEY) missing.push("GROQ_API_KEY");
  if (!PINECONE_API_KEY) missing.push("PINECONE_API_KEY");
  if (!PINECONE_INDEX_NAME) missing.push("PINECONE_INDEX_NAME");
  if (!FRONTEND_URL) missing.push("FRONTEND_URL");
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

module.exports = {
  PORT,
  GROQ_API_KEY,
  PINECONE_API_KEY,
  PINECONE_INDEX_NAME,
  PINECONE_CLOUD,
  PINECONE_REGION,
  FRONTEND_URL,
  EMBEDDING_DIMENSION,
  assertEnv,
};
