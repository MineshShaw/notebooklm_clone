"use client";

import { useCallback, useState } from "react";
import { FileSidebar } from "@/components/FileSidebar";
import { UploadZone } from "@/components/UploadZone";
import { ChatPanel } from "@/components/ChatPanel";
import { useLocalFileState } from "@/hooks/useLocalFileState";
import {
  uploadFile,
  chatRequest,
  deleteServerFile,
} from "@/services/apiClient";
import type { ChatMessage } from "@/lib/types";

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `m-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function NotebookApp() {
  const {
    files,
    activeFileIds,
    addFile,
    removeFile,
    clearAllFiles,
    toggleActive,
    setActiveFileIds,
  } = useLocalFileState();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [busyFileId, setBusyFileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = useCallback(
    async (file: File) => {
      const lower = file.name.toLowerCase();
      if (!lower.endsWith(".pdf") && !lower.endsWith(".txt")) {
        setError("Only PDF and TXT files are supported.");
        return;
      }
      setError(null);
      setUploading(true);
      try {
        const meta = await uploadFile(file);
        addFile(meta);
      } catch (e: unknown) {
        const msg =
          e && typeof e === "object" && "response" in e
            ? String(
                (e as { response?: { data?: { error?: string } } }).response
                  ?.data?.error
              )
            : "";
        setError(msg || (e instanceof Error ? e.message : "Upload failed."));
      } finally {
        setUploading(false);
      }
    },
    [addFile]
  );

  const handleRemove = useCallback(
    async (fileId: string) => {
      setBusyFileId(fileId);
      setError(null);
      try {
        await deleteServerFile(fileId);
        removeFile(fileId);
        setMessages((prev) => prev);
      } catch (e: unknown) {
        const msg =
          e && typeof e === "object" && "response" in e
            ? String(
                (e as { response?: { data?: { error?: string } } }).response
                  ?.data?.error
              )
            : "";
        setError(msg || (e instanceof Error ? e.message : "Remove failed."));
      } finally {
        setBusyFileId(null);
      }
    },
    [removeFile]
  );

  const handleClearAll = useCallback(async () => {
    if (files.length === 0) return;
    setBusyFileId("__all__");
    setError(null);
    try {
      await Promise.all(files.map((f) => deleteServerFile(f.fileId)));
      clearAllFiles();
      setMessages([]);
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? String(
              (e as { response?: { data?: { error?: string } } }).response?.data
                ?.error
            )
          : "";
      setError(msg || (e instanceof Error ? e.message : "Clear failed."));
    } finally {
      setBusyFileId(null);
    }
  }, [files, clearAllFiles]);

  const handleSend = useCallback(
    async (text: string) => {
      if (activeFileIds.length === 0) return;
      const userMsg: ChatMessage = {
        id: newId(),
        role: "user",
        content: text,
      };
      const assistantId = newId();
      const pending: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        pending: true,
      };
      setMessages((prev) => [...prev, userMsg, pending]);
      setChatLoading(true);
      setError(null);
      try {
        const { answer, sources } = await chatRequest({
          message: text,
          selectedFileIds: activeFileIds,
        });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: answer, sources, pending: false }
              : m
          )
        );
      } catch (e: unknown) {
        const msg =
          e && typeof e === "object" && "response" in e
            ? String(
                (e as { response?: { data?: { error?: string } } }).response
                  ?.data?.error
              )
            : "";
        const errText =
          msg || (e instanceof Error ? e.message : "Something went wrong.");
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: errText,
                  pending: false,
                  sources: [],
                }
              : m
          )
        );
      } finally {
        setChatLoading(false);
      }
    },
    [activeFileIds]
  );

  const selectAll = useCallback(() => {
    setActiveFileIds(files.map((f) => f.fileId));
  }, [files, setActiveFileIds]);

  const canSend = activeFileIds.length > 0;

  return (
    <div className="flex min-h-screen max-h-screen flex-1 flex-col lg:flex-row">
      <FileSidebar
        files={files}
        activeFileIds={activeFileIds}
        onToggle={toggleActive}
        onRemove={handleRemove}
        onClearAll={handleClearAll}
        onSelectAll={selectAll}
        busyFileId={busyFileId}
        handleUpload={handleUpload}
        uploading={uploading}
      />

      <main className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden p-4 lg:p-6">
        <header className="shrink-0">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            NotebookLM-style RAG
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Answers are grounded in your selected documents only.
          </p>
        </header>

        {files.length === 0 && (
          <section className="shrink-0 space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Upload
            </h2>
            <UploadZone
              onFileSelected={handleUpload}
              uploading={uploading}
              disabled={busyFileId !== null}
            />
          </section>
        )}

        <section className="flex min-h-0 flex-1 flex-col gap-3">
          <h2 className="shrink-0 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Chat
          </h2>
          <div className="flex min-h-[min(60vh,520px)] flex-1 flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
            {error && (
              <div className="mb-3 shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                {error}
              </div>
            )}
            <ChatPanel
              messages={messages}
              onSend={handleSend}
              loading={chatLoading}
              canSend={canSend}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
