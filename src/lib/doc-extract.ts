/**
 * Simple text extraction from DOCX and PPTX files.
 * Both formats are ZIP archives containing XML files.
 */

interface ZipEntry {
  name: string;
  data: Buffer;
}

/**
 * Minimal ZIP reader that extracts file entries from a buffer.
 * Only handles the subset of ZIP needed for OOXML documents.
 */
function readZipEntries(buffer: Buffer): ZipEntry[] {
  const entries: ZipEntry[] = [];
  let offset = 0;

  while (offset < buffer.length - 4) {
    const sig = buffer.readUInt32LE(offset);
    if (sig !== 0x04034b50) break; // local file header signature

    const compressionMethod = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const fileNameLen = buffer.readUInt16LE(offset + 26);
    const extraLen = buffer.readUInt16LE(offset + 28);
    const fileName = buffer.toString("utf8", offset + 30, offset + 30 + fileNameLen);
    const dataStart = offset + 30 + fileNameLen + extraLen;

    if (compressionMethod === 0 && compressedSize > 0) {
      entries.push({
        name: fileName,
        data: buffer.subarray(dataStart, dataStart + compressedSize),
      });
    } else if (compressionMethod === 8) {
      // Deflate — use zlib
      try {
        const zlib = require("zlib") as typeof import("zlib");
        const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
        const decompressed = zlib.inflateRawSync(compressed);
        entries.push({ name: fileName, data: decompressed });
      } catch {
        // skip entries we can't decompress
      }
    }

    offset = dataStart + compressedSize;
  }

  return entries;
}

function stripXmlTags(xml: string): string {
  return xml
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#\d+;/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract text from a DOCX buffer.
 * Reads word/document.xml from the ZIP archive.
 */
export function extractDocxText(buffer: Buffer): string {
  const entries = readZipEntries(buffer);
  const docEntry = entries.find((e) => e.name === "word/document.xml");
  if (!docEntry) return "";

  const xml = docEntry.data.toString("utf8");
  // Extract text from <w:t> tags, preserving paragraph breaks
  const paragraphs: string[] = [];
  const pRegex = /<w:p[\s>][\s\S]*?<\/w:p>/g;
  let pMatch: RegExpExecArray | null;
  while ((pMatch = pRegex.exec(xml)) !== null) {
    const tRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
    let text = "";
    let tMatch: RegExpExecArray | null;
    while ((tMatch = tRegex.exec(pMatch[0])) !== null) {
      text += tMatch[1];
    }
    if (text.trim()) paragraphs.push(text.trim());
  }

  return paragraphs.join("\n");
}

/**
 * Extract text from a PPTX buffer.
 * Reads ppt/slides/slide*.xml from the ZIP archive.
 */
export function extractPptxText(buffer: Buffer): string {
  const entries = readZipEntries(buffer);
  const slideEntries = entries
    .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.name))
    .sort((a, b) => {
      const numA = parseInt(a.name.match(/slide(\d+)/)?.[1] ?? "0");
      const numB = parseInt(b.name.match(/slide(\d+)/)?.[1] ?? "0");
      return numA - numB;
    });

  const slides: string[] = [];
  for (const entry of slideEntries) {
    const xml = entry.data.toString("utf8");
    const tRegex = /<a:t>([\s\S]*?)<\/a:t>/g;
    const texts: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = tRegex.exec(xml)) !== null) {
      if (match[1].trim()) texts.push(match[1].trim());
    }
    if (texts.length > 0) {
      slides.push(texts.join(" "));
    }
  }

  return slides.join("\n\n");
}

/**
 * Extract text from a document buffer based on MIME type.
 */
export function extractDocumentText(buffer: Buffer, mimeType: string): string | null {
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return extractDocxText(buffer);
  }
  if (mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
    return extractPptxText(buffer);
  }
  return null;
}
