"use client";

import type { SourceChunk } from "@/lib/types";
import { ChevronDown } from "lucide-react";

type Props = {
  sources: SourceChunk[];
};

export function SourceCards({ sources }: Props) {
  if (!sources?.length) return null;

  return (
    <details className="group mt-3 rounded-xl border border-zinc-200 bg-zinc-50/80 dark:border-zinc-700 dark:bg-zinc-900/60">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
        <ChevronDown className="h-4 w-4 shrink-0 transition group-open:rotate-180" />
        Sources ({sources.length})
      </summary>
      <div className="space-y-2 border-t border-zinc-200 p-3 dark:border-zinc-700">
        {sources.map((s, i) => (
          <article
            key={`${s.fileId}-${s.chunkIndex}-${i}`}
            className="rounded-lg border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-700 dark:bg-zinc-950/40"
          >
            <div className="mb-2 flex flex-wrap gap-2 text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
              <span className="rounded-md bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
                {s.fileName}
              </span>
              <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                Chunk {s.chunkIndex}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
              {s.text}
            </p>
          </article>
        ))}
      </div>
    </details>
  );
}
