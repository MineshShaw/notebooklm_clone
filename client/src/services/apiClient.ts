import axios from "axios";
import type { SourceChunk, UploadedFileMeta } from "@/lib/types";

const baseURL =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001"
    : process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001";

const client = axios.create({
  baseURL,
  timeout: 120000,
  withCredentials: true,
});

export async function uploadFile(file: File): Promise<UploadedFileMeta> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await client.post<UploadedFileMeta>("/api/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function chatRequest(body: {
  message: string;
  selectedFileIds: string[];
}): Promise<{ answer: string; sources: SourceChunk[] }> {
  const { data } = await client.post("/api/chat", body);
  return data;
}

export async function listServerFiles(): Promise<UploadedFileMeta[]> {
  const { data } = await client.get<{ files: UploadedFileMeta[] }>(
    "/api/files"
  );
  return data.files ?? [];
}

export async function deleteServerFile(fileId: string): Promise<void> {
  await client.delete(`/api/files/${encodeURIComponent(fileId)}`);
}
