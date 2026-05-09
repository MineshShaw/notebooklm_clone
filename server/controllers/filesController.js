const path = require("path");
const fs = require("fs/promises");
const { readAll, removeByFileId } = require("../utils/fileMetadataStore");
const { deleteByFileId } = require("../services/pineconeService");

async function listFiles(_req, res) {
  try {
    const files = await readAll();
    const sanitized = files.map((f) => ({
      fileId: f.fileId,
      fileName: f.fileName,
      uploadDate: f.uploadDate,
    }));
    return res.json({ files: sanitized });
  } catch (err) {
    console.error("List files error:", err);
    return res.status(500).json({ error: err.message || "Failed to list files." });
  }
}

async function deleteFile(req, res) {
  try {
    const { fileId } = req.params;
    if (!fileId) {
      return res.status(400).json({ error: "fileId is required." });
    }

    const removed = await removeByFileId(fileId);
    if (!removed) {
      return res.status(404).json({ error: "File not found." });
    }

    await deleteByFileId(fileId);

    const absPath = path.join(__dirname, "..", removed.storedPath);
    try {
      await fs.unlink(absPath);
    } catch (e) {
      console.warn("Could not delete local file:", absPath, e.message);
    }

    return res.json({ ok: true, fileId });
  } catch (err) {
    console.error("Delete file error:", err);
    return res.status(500).json({ error: err.message || "Delete failed." });
  }
}

module.exports = {
  listFiles,
  deleteFile,
};
