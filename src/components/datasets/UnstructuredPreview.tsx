"use client";

import { useMemo } from "react";
import { FileText, Image as ImageIcon, FileType } from "lucide-react";
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
  const icon = file.unstructuredType === "pptx" ? FileType : FileText;
  const Icon = icon;
  const label = file.unstructuredType === "pptx" ? "PowerPoint" : "Word";

  return (
    <div className="flex flex-col items-center gap-3 py-8">
      <Icon className="h-16 w-16 text-muted-foreground" />
      <p className="text-sm font-medium">{file.fileName}</p>
      <p className="text-xs text-muted-foreground">
        {label} file &mdash; content will be extracted by AI during processing
      </p>
    </div>
  );
}

export function UnstructuredPreview({ file }: UnstructuredPreviewProps) {
  const type = file.unstructuredType;

  if (!type) return null;

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
}
