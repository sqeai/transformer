import { extractFileFromS3 } from "@/lib/ocr";

export interface ChatAttachment {
  fileName: string;
  filePath: string;
  mimeType: string;
}

/**
 * Downloads each attachment from S3, runs OCR/text extraction via Anthropic,
 * and returns a single context string to prepend to the user message.
 */
export async function resolveAttachments(
  attachments: ChatAttachment[],
): Promise<string> {
  if (attachments.length === 0) return "";

  const results = await Promise.allSettled(
    attachments.map(async (att) => {
      const result = await extractFileFromS3(
        att.filePath,
        att.fileName,
        att.mimeType,
      );
      return { fileName: att.fileName, text: result.extractedText };
    }),
  );

  const parts: string[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.text) {
      parts.push(`--- File: ${r.value.fileName} ---\n${r.value.text}`);
    }
  }

  if (parts.length === 0) return "";

  return `[Attached file content]\n${parts.join("\n\n")}\n[End of attached file content]\n\n`;
}
