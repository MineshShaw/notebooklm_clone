const { chatWithDocuments } = require("../services/chatService");

async function handleChat(req, res) {
  try {
    const { message, selectedFileIds } = req.body || {};
    const result = await chatWithDocuments(message, selectedFileIds);
    return res.json(result);
  } catch (err) {
    console.error("Chat error:", err);
    const msg = err.message || "Chat failed.";
    const status =
      msg.includes("Select at least") || msg.includes("Message is required")
        ? 400
        : 400;
    return res.status(status).json({ error: msg });
  }
}

module.exports = {
  handleChat,
};
