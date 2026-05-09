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
  score?: number;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SourceChunk[];
  pending?: boolean;
};
