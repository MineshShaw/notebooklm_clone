"use client";

import { useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { Send, Loader2 } from "lucide-react";
import type { ChatMessage } from "@/lib/types";
import { SourceCards } from "@/components/SourceCards";
import { useAutoScroll } from "@/hooks/useAutoScroll";

type Props = {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  loading: boolean;
  canSend: boolean;
  placeholder?: string;
};

export function ChatPanel({
  messages,
  onSend,
  loading,
  canSend,
  placeholder = "Ask a question about your documents…",
}: Props) {
  const [input, setInput] = useState("");
  const scrollRef = useAutoScroll<HTMLDivElement>([messages, loading]);

  const submit = useCallback(() => {
    const t = input.trim();
    if (!t || loading || !canSend) return;
    setInput("");
    onSend(t);
  }, [input, loading, canSend, onSend]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 py-2"
      >
        {messages.length === 0 && !loading && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900/40">
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
              Chat with your documents
            </p>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              Upload files on the right, select them in the sidebar, then ask
              grounded questions. Answers use only your selected sources.
            </p>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[min(100%,42rem)] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                m.role === "user"
                  ? "bg-emerald-600 text-white"
                  : "border border-zinc-200 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              }`}
            >
              {m.role === "user" ? (
                <p className="whitespace-pre-wrap">{m.content}</p>
              ) : (
                <>
                  {m.pending ? (
                    <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Thinking…
                    </div>
                  ) : (
                    <div className="max-w-none text-sm leading-relaxed [&_a]:text-emerald-600 [&_code]:rounded [&_code]:bg-zinc-100 [&_code]:px-1 [&_code]:text-[0.9em] dark:[&_code]:bg-zinc-800">
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => (
                            <p className="mb-2 last:mb-0">{children}</p>
                          ),
                          ul: ({ children }) => (
                            <ul className="mb-2 list-disc pl-5">{children}</ul>
                          ),
                          ol: ({ children }) => (
                            <ol className="mb-2 list-decimal pl-5">{children}</ol>
                          ),
                          li: ({ children }) => (
                            <li className="mb-1">{children}</li>
                          ),
                          strong: ({ children }) => (
                            <strong className="font-semibold">{children}</strong>
                          ),
                        }}
                      >
                        {m.content}
                      </ReactMarkdown>
                    </div>
                  )}
                  {!m.pending && m.sources && m.sources.length > 0 && (
                    <SourceCards sources={m.sources} />
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-auto border-t border-zinc-200 pt-3 dark:border-zinc-800">
        {!canSend && (
          <p className="mb-2 text-center text-xs text-amber-700 dark:text-amber-400">
            Select at least one document in the sidebar to enable chat.
          </p>
        )}
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            placeholder={placeholder}
            disabled={loading || !canSend}
            className="min-h-[44px] flex-1 resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-inner outline-none ring-emerald-500/30 placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-2 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
          <button
            type="button"
            onClick={submit}
            disabled={loading || !canSend || !input.trim()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-40"
            aria-label="Send message"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
