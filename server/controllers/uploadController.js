const path = require("path");
const fs = require("fs/promises");
const { processAndIndexDocument } = require("../services/documentProcessingService");
const { add: addMetadata } = require("../utils/fileMetadataStore");

const UPLOAD_ROOT = path.join(__dirname, "..", "uploads");

async function handleUpload(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    const originalName = req.file.originalname || "document";
    const storedPath = req.file.path;

    const result = await processAndIndexDocument({
      filePath: storedPath,
      originalName,
      mimeType: req.file.mimetype || "",
    });

    const relativeStored = path.relative(path.join(__dirname, ".."), storedPath);

    await addMetadata({
      fileId: result.fileId,
      fileName: result.fileName,
      uploadDate: result.uploadDate,
      storedPath: relativeStored.replace(/\\/g, "/"),
    });

    return res.status(201).json({
      fileId: result.fileId,
      fileName: result.fileName,
      uploadDate: result.uploadDate,
      chunkCount: result.chunkCount,
    });
  } catch (err) {
    console.error("Upload error:", err);
    if (req.file?.path) {
      try {
        await fs.unlink(req.file.path);
      } catch {
        /* ignore */
      }
    }
    return res.status(500).json({
      error: err.message || "Upload processing failed.",
    });
  }
}

module.exports = {
  handleUpload,
  UPLOAD_ROOT,
};
