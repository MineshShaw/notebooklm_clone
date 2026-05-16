export type UploadedFileMeta = {
  fileId: string;
  fileName: string;
  uploadDate: string;
};

export type SourceChunk = {
  fileId: string;
  fileName: string;
  chunkIndex: number;
  text: string;
  /** Stable [1], [2] marker matching inline citations in the answer */
  citationId?: number;
  score?: number;
  relevanceScore?: number;
  relevanceReason?: string;
  /** True when the answer text includes [citationId] */
  citedInAnswer?: boolean;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SourceChunk[];
  pending?: boolean;
};
