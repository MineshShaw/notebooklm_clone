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
      if (!lower.endsWith(".pdf") && file.type !== "application/pdf"
        && !lower.endsWith(".txt") && file.type !== "text/plain"
        && !lower.endsWith(".csv") && file.type !== "text/csv" && !lower.endsWith(".xlsx") && file.type !== "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        && !lower.endsWith(".docx") && file.type !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
        setError("Only PDF, CSV, XLSX, DOCX, and TXT files are supported.");
        return;
      }
      setError(null);
      setUploading(true);
      try {
        const meta = await uploadFile(file);
        addFile(meta);
      } catch (e: unknown) {
        console.error("Upload error:", e);
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
        // Send recent history so the server can resolve pronouns during query rewrite.
        const conversationHistory = messages
          .filter((m) => !m.pending && m.content.trim())
          .slice(-6)
          .map((m) => ({
            role: m.role,
            content: m.content,
          }));

        const { answer, sources } = await chatRequest({
          message: text,
          selectedFileIds: activeFileIds,
          conversationHistory,
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

        <section className="flex h-full max-h-full flex-col overflow-hidden">
          <section
            className={`min-h-0 overflow-y-auto ${
              files.length === 0 ? "basis-[30%] shrink-0" : "hidden"
            }`}
          >
            <div className="space-y-3 h-full">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Upload
              </h2>

              <UploadZone
                onFileSelected={handleUpload}
                uploading={uploading}
                disabled={busyFileId !== null}
              />
            </div>
          </section>

          <section className={`flex min-h-0 ${files.length === 0 ? "basis-[70%]" : "basis-full"} flex-col overflow-hidden`}>
            <h2 className="shrink-0 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Chat
            </h2>

            <div className="mt-3 flex min-h-0 flex-1 flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
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
        </section>
      </main>
    </div>
  );
}
