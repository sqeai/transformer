import Anthropic from "@anthropic-ai/sdk";

export interface OcrInput {
  base64: string;
  mimeType: string;
  fileName: string;
  targetPaths?: string[];
}

export interface OcrResult {
  extractedText: string;
  columns: string[];
  rows: Record<string, unknown>[];
}

type AnthropicMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

const SUPPORTED_IMAGE_TYPES: string[] = ["image/png", "image/jpeg", "image/gif", "image/webp"];

function buildExtractionPrompt(fileName: string, targetPaths?: string[]): string {
  const targetSection = targetPaths?.length
    ? `\n\nThe target schema has these fields: ${targetPaths.map((p) => `"${p}"`).join(", ")}. Try to extract data that maps to these fields when possible.`
    : "";

  return `You are a data extraction specialist. Extract ALL text and structured data from this document/image.

File: "${fileName}"${targetSection}

Your response MUST be valid JSON with this exact structure:
{
  "extractedText": "<full text content of the document>",
  "columns": ["column1", "column2", ...],
  "rows": [{"column1": "value1", "column2": "value2"}, ...]
}

Rules:
1. "extractedText" should contain ALL readable text from the document, preserving structure with newlines.
2. If the document contains tabular data, extract it into "columns" and "rows".
3. If the document is free-form text (letter, report, etc.), create columns like ["field", "value"] and extract key-value pairs, or use a single "content" column with the text split into logical rows.
4. For images with text, OCR all visible text.
5. For multi-page documents, process all pages.
6. Be thorough — extract everything visible.
7. Return ONLY the JSON object, no markdown fences or extra text.`;
}

function parseResponse(responseText: string): OcrResult {
  try {
    const cleaned = responseText.replace(/^```json\s*/, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      extractedText: String(parsed.extractedText ?? ""),
      columns: Array.isArray(parsed.columns) ? parsed.columns : [],
      rows: Array.isArray(parsed.rows) ? parsed.rows : [],
    };
  } catch {
    return {
      extractedText: responseText,
      columns: ["content"],
      rows: [{ content: responseText }],
    };
  }
}

export async function extractWithAnthropic(input: OcrInput): Promise<OcrResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const client = new Anthropic({ apiKey });
  const prompt = buildExtractionPrompt(input.fileName, input.targetPaths);
  const isImage = SUPPORTED_IMAGE_TYPES.includes(input.mimeType);
  const isPdf = input.mimeType === "application/pdf";

  const contentBlocks: Anthropic.ContentBlockParam[] = [];

  if (isImage) {
    contentBlocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: input.mimeType as AnthropicMediaType,
        data: input.base64,
      },
    });
  } else if (isPdf) {
    contentBlocks.push({
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: input.base64,
      },
    });
  } else {
    let textContent: string;
    if (input.mimeType === "text/plain") {
      textContent = Buffer.from(input.base64, "base64").toString("utf-8");
    } else {
      const { extractDocumentText } = await import("./doc-extract");
      const docBuffer = Buffer.from(input.base64, "base64");
      const extracted = extractDocumentText(docBuffer, input.mimeType);
      textContent = extracted ?? `[Unable to extract text from ${input.mimeType} file: ${input.fileName}]`;
    }
    contentBlocks.push({
      type: "text",
      text: `--- DOCUMENT CONTENT ---\n${textContent}`,
    });
  }

  contentBlocks.push({ type: "text", text: prompt });

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: contentBlocks,
      },
    ],
  });

  const responseText = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  return parseResponse(responseText);
}

/**
 * Server-side OCR: reads a file from S3 and extracts content using Anthropic.
 */
export async function extractFileFromS3(
  filePath: string,
  fileName: string,
  mimeType: string,
  targetPaths?: string[],
): Promise<OcrResult> {
  const { downloadS3FileToTmp } = await import("./s3-files");
  const { promises: fs } = await import("fs");

  const tmpPath = await downloadS3FileToTmp(filePath);
  const buffer = await fs.readFile(tmpPath);
  await fs.unlink(tmpPath).catch(() => {});

  const base64 = buffer.toString("base64");
  return extractWithAnthropic({ base64, mimeType, fileName, targetPaths });
}
