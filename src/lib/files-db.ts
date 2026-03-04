import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type FileRecordType = "raw" | "processed" | "intermediary" | "final";

export interface FileDimensions {
  rowCount: number;
  columnCount: number;
}

export interface FileRow {
  id: string;
  user_id: string;
  file_id: string;
  storage_url: string;
  name: string;
  dimensions: FileDimensions;
  type: FileRecordType;
  version_id: number;
}

interface CreateFileParams {
  userId: string;
  fileId?: string;
  storageUrl: string;
  name: string;
  dimensions: FileDimensions;
  type: FileRecordType;
}

export function generateFileId(): string {
  return randomUUID().replace(/-/g, "");
}

export async function createFileRecord(supabase: SupabaseClient, params: CreateFileParams): Promise<FileRow> {
  const fileId = params.fileId ?? generateFileId();

  const { data, error } = await supabase
    .from("files")
    .insert({
      user_id: params.userId,
      file_id: fileId,
      storage_url: params.storageUrl,
      name: params.name,
      dimensions: params.dimensions,
      type: params.type,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create file record: ${error.message}`);
  }

  return data as FileRow;
}
