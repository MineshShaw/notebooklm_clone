const fs = require("fs/promises");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const META_FILE = path.join(DATA_DIR, "files.json");

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(META_FILE);
  } catch {
    await fs.writeFile(META_FILE, "[]", "utf8");
  }
}

/**
 * @returns {Promise<Array<{ fileId: string, fileName: string, uploadDate: string, storedPath: string }>>}
 */
async function readAll() {
  await ensureDataDir();
  const raw = await fs.readFile(META_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAll(records) {
  await ensureDataDir();
  await fs.writeFile(META_FILE, JSON.stringify(records, null, 2), "utf8");
}

async function add(record) {
  const all = await readAll();
  all.push(record);
  await writeAll(all);
}

async function removeByFileId(fileId) {
  const all = await readAll();
  const next = all.filter((r) => r.fileId !== fileId);
  await writeAll(next);
  return all.find((r) => r.fileId === fileId) || null;
}

async function getByFileId(fileId) {
  const all = await readAll();
  return all.find((r) => r.fileId === fileId) || null;
}

module.exports = {
  readAll,
  add,
  removeByFileId,
  getByFileId,
  DATA_DIR,
};
