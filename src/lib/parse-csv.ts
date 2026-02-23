function parseRow(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (inQuotes) {
      current += c;
    } else if (c === ",") {
      out.push(current.trim());
      current = "";
    } else {
      current += c;
    }
  }
  out.push(current.trim());
  return out;
}

/**
 * Extracts raw grid data from CSV text for preview purposes.
 * Returns all rows as string arrays without interpreting headers.
 */
export function extractCsvPreview(
  csvText: string,
  maxRows = 50,
): { grid: string[][]; totalRows: number; totalColumns: number } {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 0) return { grid: [], totalRows: 0, totalColumns: 0 };

  const grid: string[][] = [];
  let maxCols = 0;
  const limit = Math.min(lines.length, maxRows);
  for (let i = 0; i < limit; i++) {
    const cells = parseRow(lines[i]!).map((c) => c.replace(/^"|"$/g, ""));
    maxCols = Math.max(maxCols, cells.length);
    grid.push(cells);
  }

  return { grid, totalRows: lines.length, totalColumns: maxCols };
}

export interface CsvTopBottomBoundary {
  headerRowIndex?: number;
  dataStartRowIndex?: number;
  dataEndRowIndex?: number;
}

/**
 * Extracts a "top N + bottom N" grid preview from CSV text.
 *
 * When a boundary is provided the window is relative to the selected
 * data range, including the header and any rows above dataStartRowIndex.
 */
export function extractCsvPreviewTopBottom(
  csvText: string,
  topN: number,
  bottomN: number,
  boundary?: CsvTopBottomBoundary,
): {
  rows: { originalIndex: number; data: string[] }[];
  totalRows: number;
  totalColumns: number;
} {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 0) return { rows: [], totalRows: 0, totalColumns: 0 };

  let maxCols = 0;
  const parsedLines: string[][] = [];
  for (const line of lines) {
    const cells = parseRow(line).map((c) => c.replace(/^"|"$/g, ""));
    maxCols = Math.max(maxCols, cells.length);
    parsedLines.push(cells);
  }

  const totalRows = parsedLines.length;
  const collected = new Set<number>();
  const rows: { originalIndex: number; data: string[] }[] = [];

  const addRow = (idx: number) => {
    if (idx < 0 || idx >= totalRows || collected.has(idx)) return;
    collected.add(idx);
    rows.push({ originalIndex: idx, data: parsedLines[idx] });
  };

  if (boundary) {
    const hdr = boundary.headerRowIndex ?? 0;
    const ds = boundary.dataStartRowIndex ?? (hdr + 1);
    const de = Math.min(boundary.dataEndRowIndex ?? totalRows - 1, totalRows - 1);

    for (let r = 0; r <= hdr; r++) addRow(r);
    for (let r = hdr + 1; r < ds; r++) addRow(r);

    const dataLen = de - ds + 1;
    if (dataLen <= topN + bottomN) {
      for (let r = ds; r <= de; r++) addRow(r);
    } else {
      for (let r = ds; r < ds + topN; r++) addRow(r);
      for (let r = de - bottomN + 1; r <= de; r++) addRow(r);
    }
  } else {
    const topEnd = Math.min(topN, totalRows);
    const bottomStart = Math.max(topEnd, totalRows - bottomN);
    for (let r = 0; r < topEnd; r++) addRow(r);
    for (let r = bottomStart; r < totalRows; r++) addRow(r);
  }

  rows.sort((a, b) => a.originalIndex - b.originalIndex);

  return { rows, totalRows, totalColumns: maxCols };
}

export interface CsvParseOptions {
  headerRowIndex?: number;
  dataStartRowIndex?: number;
  dataEndRowIndex?: number;
  columnsToKeep?: number[];
}

/**
 * Simple CSV parser for browser (avoids csv-parse bundle issues).
 * Supports boundary options for header row, data range, and column filtering.
 */
export function parseCsvToRows(
  csvText: string,
  options?: CsvParseOptions,
): {
  columns: string[];
  rows: Record<string, unknown>[];
} {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 0) return { columns: [], rows: [] };

  const headerIdx = options?.headerRowIndex ?? 0;
  const dataStart = options?.dataStartRowIndex ?? headerIdx + 1;
  const dataEnd = options?.dataEndRowIndex ?? lines.length - 1;
  const columnsToKeep = options?.columnsToKeep;

  const headerCells = parseRow(lines[headerIdx] ?? "");
  const allColumns = headerCells.map((h) => h.replace(/^"|"$/g, "").trim() || "Column");

  const keptIndices = columnsToKeep ?? allColumns.map((_, i) => i);
  const columns = keptIndices.map((i) => allColumns[i] ?? `Column_${i + 1}`);

  const rows: Record<string, unknown>[] = [];
  for (let i = dataStart; i <= Math.min(dataEnd, lines.length - 1); i++) {
    const values = parseRow(lines[i]!);
    const obj: Record<string, unknown> = {};
    keptIndices.forEach((colIdx, j) => {
      obj[columns[j]] = values[colIdx]?.replace(/^"|"$/g, "") ?? "";
    });
    rows.push(obj);
  }

  return { columns, rows };
}
