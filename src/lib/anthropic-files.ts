import Anthropic, { toFile } from "@anthropic-ai/sdk";

const FILES_BETA = "files-api-2025-04-14" as const;

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

export interface UploadedFile {
  fileId: string;
  fileName: string;
}

/**
 * Upload a buffer to the Anthropic Files API.
 * Returns the file_id for referencing in messages.
 */
export async function uploadFileToAnthropic(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<UploadedFile> {
  const client = getClient();
  const file = await toFile(buffer, fileName, { type: mimeType });
  const result = await client.beta.files.upload({
    file,
    betas: [FILES_BETA],
  });
  return { fileId: result.id, fileName };
}

/**
 * Delete a file from the Anthropic Files API.
 * Silently ignores errors (file may already be deleted or expired).
 */
export async function deleteFileFromAnthropic(fileId: string): Promise<void> {
  try {
    const client = getClient();
    await client.beta.files.delete(fileId, {
      betas: [FILES_BETA],
    });
  } catch (err) {
    console.warn(`Failed to delete Anthropic file ${fileId}:`, (err as Error).message);
  }
}

/**
 * Delete multiple files from the Anthropic Files API.
 */
export async function deleteFilesFromAnthropic(fileIds: string[]): Promise<void> {
  await Promise.allSettled(fileIds.map((id) => deleteFileFromAnthropic(id)));
}

export { FILES_BETA };
