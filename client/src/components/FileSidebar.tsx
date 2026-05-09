"use client";

import { FileText, Trash2, CheckSquare, Square } from "lucide-react";
import type { UploadedFileMeta } from "@/lib/types";
import { UploadZone } from "./UploadZone";

type Props = {
  files: UploadedFileMeta[];
  activeFileIds: string[];
  onToggle: (fileId: string) => void;
  onRemove: (fileId: string) => void;
  onClearAll: () => void;
  onSelectAll: () => void;
  busyFileId: string | null;
  handleUpload: (file: File) => void;
  uploading: boolean;
};

export function FileSidebar({
  files,
  activeFileIds,
  onToggle,
  onRemove,
  onClearAll,
  onSelectAll,
  busyFileId,
  handleUpload,
  uploading,
}: Props) {
  return (
    <aside className="flex w-full max-w-sm flex-col border-r border-zinc-200 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-950/50">
      <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Sources
        </h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Select documents to include in answers.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onSelectAll}
            disabled={files.length === 0 || busyFileId !== null}
            className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={onClearAll}
            disabled={files.length === 0 || busyFileId !== null}
            className="rounded-lg border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-700 shadow-sm transition hover:bg-red-50 disabled:opacity-40 dark:border-red-900 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            Clear all
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {files.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
            No documents yet. Upload a PDF or TXT file to get started.
          </div>
        ) : (
          <ul className="space-y-1">
            {files.map((f) => {
              const active = activeFileIds.includes(f.fileId);
              return (
                <li
                  key={f.fileId}
                  className="flex items-start gap-2 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80"
                >
                  <button
                    type="button"
                    onClick={() => onToggle(f.fileId)}
                    className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                    aria-label={active ? "Deselect file" : "Select file"}
                  >
                    {active ? (
                      <CheckSquare className="h-5 w-5" />
                    ) : (
                      <Square className="h-5 w-5 text-zinc-400" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-zinc-400" />
                      <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {f.fileName}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      {new Date(f.uploadDate).toLocaleString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busyFileId !== null}
                    onClick={() => onRemove(f.fileId)}
                    className="shrink-0 rounded-lg p-2 text-zinc-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                    aria-label="Remove file"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
            <UploadZone
              onFileSelected={handleUpload}
              uploading={uploading}
              disabled={busyFileId !== null}
            />
          </ul>
        )}
      </div>
    </aside>
  );
}
