"use client";

import { useCallback, useEffect, useState } from "react";
import type { UploadedFileMeta } from "@/lib/types";
import { LS_ACTIVE_FILE_IDS, LS_UPLOADED_FILES } from "@/lib/constants";
import { listServerFiles } from "@/services/apiClient";

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

/**
 * Hydrates from localStorage, then syncs file list with GET /api/files when available.
 */
export function useLocalFileState() {
  const [files, setFiles] = useState<UploadedFileMeta[]>([]);
  const [activeFileIds, setActiveFileIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const fromLs = readStorage<UploadedFileMeta[]>(LS_UPLOADED_FILES, []);
    const activeLs = readStorage<string[]>(LS_ACTIVE_FILE_IDS, []);
    setFiles(fromLs);
    setActiveFileIds(activeLs);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    let cancelled = false;
    (async () => {
      try {
        const serverFiles = await listServerFiles();
        if (cancelled) return;
        setFiles(serverFiles);
        writeStorage(LS_UPLOADED_FILES, serverFiles);
        setActiveFileIds((prev) => {
          const allowed = new Set(serverFiles.map((f) => f.fileId));
          const next = prev.filter((id) => allowed.has(id));
          if (next.length === 0 && serverFiles.length > 0) {
            const all = serverFiles.map((f) => f.fileId);
            writeStorage(LS_ACTIVE_FILE_IDS, all);
            return all;
          }
          writeStorage(LS_ACTIVE_FILE_IDS, next);
          return next;
        });
      } catch {
        /* offline / API down — keep localStorage snapshot */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    writeStorage(LS_UPLOADED_FILES, files);
  }, [files, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    writeStorage(LS_ACTIVE_FILE_IDS, activeFileIds);
  }, [activeFileIds, hydrated]);

  const addFile = useCallback((meta: UploadedFileMeta) => {
    setFiles((prev) => {
      const without = prev.filter((f) => f.fileId !== meta.fileId);
      return [...without, meta];
    });
    setActiveFileIds((prev) =>
      prev.includes(meta.fileId) ? prev : [...prev, meta.fileId]
    );
  }, []);

  const removeFile = useCallback((fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.fileId !== fileId));
    setActiveFileIds((prev) => prev.filter((id) => id !== fileId));
  }, []);

  const clearAllFiles = useCallback(() => {
    setFiles([]);
    setActiveFileIds([]);
  }, []);

  const toggleActive = useCallback((fileId: string) => {
    setActiveFileIds((prev) =>
      prev.includes(fileId)
        ? prev.filter((id) => id !== fileId)
        : [...prev, fileId]
    );
  }, []);

  return {
    files,
    activeFileIds,
    hydrated,
    setFiles,
    setActiveFileIds,
    addFile,
    removeFile,
    clearAllFiles,
    toggleActive,
  };
}
