"use client";

import { useCallback, useState } from "react";
import { UploadCloud } from "lucide-react";

type Props = {
  onFileSelected: (file: File) => void;
  uploading: boolean;
  disabled?: boolean;
};

export function UploadZone({ onFileSelected, uploading, disabled }: Props) {
  const [drag, setDrag] = useState(false);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDrag(false);
      if (disabled || uploading) return;
      const f = e.dataTransfer.files?.[0];
      if (f) onFileSelected(f);
    },
    [disabled, uploading, onFileSelected]
  );

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) onFileSelected(f);
      e.target.value = "";
    },
    [onFileSelected]
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
      className={`relative rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
        drag
          ? "border-emerald-500 bg-emerald-50/60 dark:border-emerald-400 dark:bg-emerald-950/30"
          : "border-zinc-200 bg-zinc-50/50 dark:border-zinc-700 dark:bg-zinc-900/40"
      } ${disabled || uploading ? "opacity-60" : ""}`}
    >
      <UploadCloud className="mx-auto h-10 w-10 text-zinc-400" />
      <p className="mt-3 text-sm font-medium text-zinc-800 dark:text-zinc-100">
        Drag & drop PDF or TXT here
      </p>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        or choose a file from your device
      </p>
      <label className="mt-4 inline-flex cursor-pointer items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50">
        {uploading ? "Uploading…" : "Choose file"}
        <input
          type="file"
          accept=".pdf,.txt,application/pdf,text/plain"
          className="hidden"
          disabled={disabled || uploading}
          onChange={onChange}
        />
      </label>
    </div>
  );
}
