"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Image as ImageIcon, FileType, Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UploadedFileEntry } from "@/lib/schema-store";

interface UnstructuredPreviewProps {
  file: UploadedFileEntry;
}

function getMimeType(type: string): string {
  switch (type) {
    case "pdf": return "application/pdf";
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "txt": return "text/plain";
    case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "pptx": return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    default: return "application/octet-stream";
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function useLocalTextExtraction(file: UploadedFileEntry) {
  const [extractedText, setExtractedText] = useState<string | null>(file.extractedText ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canExtractLocally = file.unstructuredType === "pdf"
    || file.unstructuredType === "docx"
    || file.unstructuredType === "pptx"
    || file.unstructuredType === "txt";

  const extract = useCallback(async () => {
    if (extractedText !== null || !canExtractLocally) return;

    if (file.unstructuredType === "txt") {
      setExtractedText(new TextDecoder().decode(file.buffer));
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const base64 = arrayBufferToBase64(file.buffer);
      const mimeType = getMimeType(file.unstructuredType!);
      const res = await fetch("/api/extract-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64, mimeType, fileName: file.fileName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Extraction failed");
      setExtractedText(data.extractedText);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to extract text");
    } finally {
      setLoading(false);
    }
  }, [file.buffer, file.fileName, file.unstructuredType, extractedText, canExtractLocally]);

  useEffect(() => {
    if (file.extractedText) {
      setExtractedText(file.extractedText);
    }
  }, [file.extractedText]);

  return { extractedText, loading, error, extract, canExtractLocally };
}

function ImagePreview({ file }: { file: UploadedFileEntry }) {
  const url = useMemo(() => {
    const blob = new Blob([file.buffer], { type: getMimeType(file.unstructuredType!) });
    return URL.createObjectURL(blob);
  }, [file.buffer, file.unstructuredType]);

  return (
    <div className="flex flex-col items-center gap-3">
      <img
        src={url}
        alt={file.fileName}
        className="max-h-[500px] max-w-full rounded-md border object-contain"
        onLoad={() => URL.revokeObjectURL(url)}
      />
      <p className="text-xs text-muted-foreground">{file.fileName}</p>
    </div>
  );
}

function PdfPreview({ file }: { file: UploadedFileEntry }) {
  const url = useMemo(() => {
    const blob = new Blob([file.buffer], { type: "application/pdf" });
    return URL.createObjectURL(blob);
  }, [file.buffer]);

  return (
    <div className="flex flex-col gap-2">
      <iframe
        src={url}
        title={file.fileName}
        className="w-full h-[600px] rounded-md border"
      />
      <p className="text-xs text-muted-foreground">{file.fileName}</p>
    </div>
  );
}

function TextPreview({ file }: { file: UploadedFileEntry }) {
  const text = file.extractedText ?? new TextDecoder().decode(file.buffer);
  return (
    <div className="flex flex-col gap-2">
      <pre className="max-h-[500px] overflow-auto rounded-md border bg-muted/30 p-4 text-sm font-mono whitespace-pre-wrap break-words">
        {text}
      </pre>
      <p className="text-xs text-muted-foreground">
        {file.fileName} &mdash; {text.length.toLocaleString()} characters
      </p>
    </div>
  );
}

function DocPreview({ file }: { file: UploadedFileEntry }) {
  const { extractedText, loading, error, extract, canExtractLocally } = useLocalTextExtraction(file);
  const [showPreview, setShowPreview] = useState(false);
  const icon = file.unstructuredType === "pptx" ? FileType : FileText;
  const Icon = icon;
  const label = file.unstructuredType === "pptx" ? "PowerPoint" : "Word";

  const handleTogglePreview = useCallback(async () => {
    if (!showPreview && extractedText === null) {
      await extract();
    }
    setShowPreview((prev) => !prev);
  }, [showPreview, extractedText, extract]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col items-center gap-3 py-4">
        <Icon className="h-12 w-12 text-muted-foreground" />
        <p className="text-sm font-medium">{file.fileName}</p>
        <p className="text-xs text-muted-foreground">
          {label} file
        </p>
        {canExtractLocally && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleTogglePreview}
            disabled={loading}
            className="gap-2"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : showPreview ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
            {loading ? "Extracting..." : showPreview ? "Hide Preview" : "Preview Content"}
          </Button>
        )}
      </div>

      {error && (
        <p className="text-xs text-destructive text-center">{error}</p>
      )}

      {showPreview && extractedText && (
        <div className="flex flex-col gap-2">
          <pre className="max-h-[400px] overflow-auto rounded-md border bg-muted/30 p-4 text-sm font-mono whitespace-pre-wrap break-words">
            {extractedText}
          </pre>
          <p className="text-xs text-muted-foreground">
            Extracted text &mdash; {extractedText.length.toLocaleString()} characters
          </p>
        </div>
      )}
    </div>
  );
}

function FilePreviewSection({ file }: { file: UploadedFileEntry }) {
  const { extractedText, loading, error, extract } = useLocalTextExtraction(file);
  const [showPreview, setShowPreview] = useState(false);

  const handleTogglePreview = useCallback(async () => {
    if (!showPreview && extractedText === null) {
      await extract();
    }
    setShowPreview((prev) => !prev);
  }, [showPreview, extractedText, extract]);

  return (
    <div className="mt-3 border-t pt-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Extracted Text</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleTogglePreview}
          disabled={loading}
          className="h-7 gap-1.5 text-xs"
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : showPreview ? (
            <EyeOff className="h-3 w-3" />
          ) : (
            <Eye className="h-3 w-3" />
          )}
          {loading ? "Extracting..." : showPreview ? "Hide" : "Show"}
        </Button>
      </div>
      {error && (
        <p className="text-xs text-destructive mt-1">{error}</p>
      )}
      {showPreview && extractedText && (
        <pre className="mt-2 max-h-[300px] overflow-auto rounded-md border bg-muted/30 p-3 text-xs font-mono whitespace-pre-wrap break-words">
          {extractedText}
        </pre>
      )}
    </div>
  );
}

export function UnstructuredPreview({ file }: UnstructuredPreviewProps) {
  const type = file.unstructuredType;

  if (!type) return null;

  const canShowTextPreview = type === "pdf" || type === "docx" || type === "pptx";

  const mainPreview = (() => {
    switch (type) {
      case "png":
      case "jpg":
      case "jpeg":
        return <ImagePreview file={file} />;
      case "pdf":
        return <PdfPreview file={file} />;
      case "txt":
        return <TextPreview file={file} />;
      case "docx":
      case "pptx":
        return <DocPreview file={file} />;
      default:
        return (
          <div className="flex flex-col items-center gap-3 py-8">
            <ImageIcon className="h-16 w-16 text-muted-foreground" />
            <p className="text-sm font-medium">{file.fileName}</p>
            <p className="text-xs text-muted-foreground">Preview not available for this file type</p>
          </div>
        );
    }
  })();

  return (
    <div>
      {mainPreview}
      {canShowTextPreview && type !== "docx" && type !== "pptx" && (
        <FilePreviewSection file={file} />
      )}
    </div>
  );
}
