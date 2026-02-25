import ExcelJS from "exceljs";

export interface WorkbookPreview {
  sheetName: string;
  headers: string[];
  sampleRows: string[][];
  totalRows: number;
  totalColumns: number;
}

const MAX_SAMPLE_ROWS = 8;
const MAX_RAW_PREVIEW_ROWS = 30;
const MAX_COLUMNS = 60;

function cellToString(value: ExcelJS.CellValue): string {
  let raw: string;
  if (value == null) return "";
  if (typeof value === "string") {
    raw = value;
  } else if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  } else if (value instanceof Date) {
    return value.toISOString();
  } else if (typeof value === "object") {
    if ("richText" in value) {
      raw = (value as ExcelJS.CellRichTextValue).richText
        .map((seg) => seg.text)
        .join("");
    } else if ("text" in value) {
      raw = String((value as { text: string }).text);
    } else if ("result" in value) {
      const r = (value as { result: unknown }).result;
      raw = r != null ? String(r) : "";
    } else {
      raw = String(value);
    }
  } else {
    raw = String(value);
  }
  return raw.replace(/\r\n/g, "\n").trim();
}

/**
 * Collapses multi-line cell text into a single line for contexts where
 * newlines would break formatting (e.g. LLM row previews, pipe-delimited tables).
 * Joins non-empty lines with " / " so "Tên Công Ty\nCompany Name" becomes
 * "Tên Công Ty / Company Name".
 */
function collapseMultiline(text: string): string {
  if (!text.includes("\n")) return text;
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" / ");
}

export interface ExtractOptions {
  /** When true, returns all rows from row 1 (including potential metadata/title rows) instead of assuming row 1 is the header. */
  useAllRows?: boolean;
}

/**
 * Detects the largest continuous rectangular table region within a sheet.
 * Scans for the densest block of non-empty cells, trimming surrounding
 * metadata, titles, and other tables on both axes.
 *
 * Returns 1-based { startRow, endRow, startCol, endCol }.
 */
function detectTableBounds(sheet: ExcelJS.Worksheet): {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
} {
  const totalRows = Math.min(sheet.rowCount, 500);
  const totalCols = Math.min(sheet.columnCount, MAX_COLUMNS);

  if (totalRows === 0 || totalCols === 0) {
    return { startRow: 1, endRow: 1, startCol: 1, endCol: 1 };
  }

  const grid: boolean[][] = [];
  for (let r = 1; r <= totalRows; r++) {
    const row = sheet.getRow(r);
    const rowFlags: boolean[] = [];
    for (let c = 1; c <= totalCols; c++) {
      const val = cellToString(row.getCell(c).value);
      rowFlags.push(val.length > 0);
    }
    grid.push(rowFlags);
  }

  const rowFillCounts = grid.map((row) => row.filter(Boolean).length);
  const colFillCounts: number[] = [];
  for (let c = 0; c < totalCols; c++) {
    let count = 0;
    for (let r = 0; r < totalRows; r++) {
      if (grid[r][c]) count++;
    }
    colFillCounts.push(count);
  }

  const medianRowFill = sortedMedian(rowFillCounts.filter((c) => c > 0));
  const rowThreshold = Math.max(2, Math.floor(medianRowFill * 0.4));

  let startRow = -1;
  let endRow = -1;
  let bestRunLength = 0;
  let runStart = -1;
  let runLength = 0;

  for (let r = 0; r < totalRows; r++) {
    if (rowFillCounts[r] >= rowThreshold) {
      if (runStart === -1) runStart = r;
      runLength++;
    } else {
      if (runLength > bestRunLength) {
        bestRunLength = runLength;
        startRow = runStart;
        endRow = runStart + runLength - 1;
      }
      runStart = -1;
      runLength = 0;
    }
  }
  if (runLength > bestRunLength) {
    startRow = runStart;
    endRow = runStart + runLength - 1;
  }

  if (startRow === -1) {
    startRow = 0;
    endRow = totalRows - 1;
  }

  const colFillInRange: number[] = [];
  for (let c = 0; c < totalCols; c++) {
    let count = 0;
    for (let r = startRow; r <= endRow; r++) {
      if (grid[r][c]) count++;
    }
    colFillInRange.push(count);
  }

  const tableRowCount = endRow - startRow + 1;
  const colThreshold = Math.max(1, Math.floor(tableRowCount * 0.3));

  let startCol = -1;
  let endCol = -1;
  let bestColRun = 0;
  let colRunStart = -1;
  let colRunLen = 0;

  for (let c = 0; c < totalCols; c++) {
    if (colFillInRange[c] >= colThreshold) {
      if (colRunStart === -1) colRunStart = c;
      colRunLen++;
    } else {
      if (colRunLen > bestColRun) {
        bestColRun = colRunLen;
        startCol = colRunStart;
        endCol = colRunStart + colRunLen - 1;
      }
      colRunStart = -1;
      colRunLen = 0;
    }
  }
  if (colRunLen > bestColRun) {
    startCol = colRunStart;
    endCol = colRunStart + colRunLen - 1;
  }

  if (startCol === -1) {
    startCol = 0;
    endCol = totalCols - 1;
  }

  return {
    startRow: startRow + 1,
    endRow: endRow + 1,
    startCol: startCol + 1,
    endCol: endCol + 1,
  };
}

function sortedMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Trims a workbook down to a compact preview suitable for LLM consumption.
 * Detects the main table region, strips surrounding noise, limits row count,
 * and returns a structured summary.
 *
 * When `useAllRows` is true, all rows (up to MAX_RAW_PREVIEW_ROWS) from the
 * detected table region are returned in `sampleRows` with `headers` left
 * empty — useful for LLM-based header detection.
 */
export async function extractWorkbookPreview(
  buffer: ArrayBuffer,
  options?: ExtractOptions,
): Promise<WorkbookPreview> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { sheetName: "", headers: [], sampleRows: [], totalRows: 0, totalColumns: 0 };
  }

  const bounds = detectTableBounds(sheet);
  const { startRow, endRow, startCol, endCol } = bounds;
  const tableCols = endCol - startCol + 1;

  if (options?.useAllRows) {
    const rowCount = Math.min(endRow - startRow + 1, MAX_RAW_PREVIEW_ROWS);

    const sampleRows: string[][] = [];
    for (let r = startRow; r < startRow + rowCount; r++) {
      const row = sheet.getRow(r);
      const values: string[] = [];
      for (let c = startCol; c <= endCol; c++) {
        values.push(collapseMultiline(cellToString(row.getCell(c).value)));
      }
      sampleRows.push(values);
    }

    return {
      sheetName: sheet.name,
      headers: [],
      sampleRows,
      totalRows: endRow - startRow + 1,
      totalColumns: tableCols,
    };
  }

  const headerRow = sheet.getRow(startRow);
  const rawHeaders: string[] = [];
  for (let c = startCol; c <= endCol; c++) {
    rawHeaders.push(cellToString(headerRow.getCell(c).value));
  }

  const nonEmptyColIndices: number[] = [];
  for (let i = 0; i < rawHeaders.length; i++) {
    if (rawHeaders[i] && rawHeaders[i].length > 0) {
      nonEmptyColIndices.push(i);
    }
  }

  if (nonEmptyColIndices.length === 0) {
    return {
      sheetName: sheet.name,
      headers: [],
      sampleRows: [],
      totalRows: Math.max(0, endRow - startRow),
      totalColumns: 0,
    };
  }

  const headers = nonEmptyColIndices.map((i) => rawHeaders[i]);

  const dataRowCount = Math.max(0, endRow - startRow);
  const sampleCount = Math.min(MAX_SAMPLE_ROWS, dataRowCount);

  const sampleRows: string[][] = [];
  for (let r = startRow + 1; r <= startRow + sampleCount; r++) {
    const row = sheet.getRow(r);
    const values = nonEmptyColIndices.map((colIdx) =>
      cellToString(row.getCell(startCol + colIdx).value),
    );
    const allEmpty = values.every((v) => v === "");
    if (!allEmpty) {
      sampleRows.push(values);
    }
  }

  return {
    sheetName: sheet.name,
    headers,
    sampleRows,
    totalRows: dataRowCount,
    totalColumns: nonEmptyColIndices.length,
  };
}

/**
 * Returns the list of sheet names in an Excel workbook.
 */
export async function getExcelSheetNames(buffer: ArrayBuffer): Promise<string[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook.worksheets.map((s) => s.name);
}

/**
 * Dumps an entire Excel sheet as a text string for LLM consumption.
 * Returns row-by-row representation with cell values separated by " | ".
 * Caps at maxRows and maxCols to avoid token overflow.
 * @param buffer Excel file buffer
 * @param sheetIndex 0-based index of the sheet to dump
 * @param maxRows Maximum rows to include (default 500)
 * @param maxCols Maximum columns to include (default 50)
 */
export async function dumpSheetAsText(
  buffer: ArrayBuffer,
  sheetIndex: number,
  maxRows = 500,
  maxCols = 50,
): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[sheetIndex] ?? workbook.worksheets[0];
  if (!sheet) {
    return "";
  }

  const rowCount = Math.min(sheet.rowCount, maxRows);
  const colCount = Math.min(sheet.columnCount, maxCols);

  const lines: string[] = [];
  lines.push(`Sheet: "${sheet.name}" (${sheet.rowCount} total rows, ${sheet.columnCount} total columns)`);
  lines.push("");

  for (let r = 1; r <= rowCount; r++) {
    const row = sheet.getRow(r);
    const cells: string[] = [];
    for (let c = 1; c <= colCount; c++) {
      const cellValue = cellToString(row.getCell(c).value);
      cells.push(collapseMultiline(cellValue));
    }
    lines.push(`Row ${r}: ${cells.join(" | ")}`);
  }

  return lines.join("\n");
}

/**
 * Extracts a raw grid (array of string arrays) from an Excel buffer
 * for client-side preview. Returns up to `maxRows` rows and `maxCols` columns.
 * @param sheetIndex 0-based index of the sheet to extract (default 0).
 */
export async function extractExcelGrid(
  buffer: ArrayBuffer,
  maxRows = 50,
  maxCols = 60,
  sheetIndex = 0,
): Promise<{ grid: string[][]; totalRows: number; totalColumns: number }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[sheetIndex] ?? workbook.worksheets[0];
  if (!sheet) return { grid: [], totalRows: 0, totalColumns: 0 };

  const rowCount = Math.min(sheet.rowCount, maxRows);
  const colCount = Math.min(sheet.columnCount, maxCols);

  const grid: string[][] = [];
  for (let r = 1; r <= rowCount; r++) {
    const row = sheet.getRow(r);
    const cells: string[] = [];
    for (let c = 1; c <= colCount; c++) {
      cells.push(cellToString(row.getCell(c).value));
    }
    grid.push(cells);
  }

  return { grid, totalRows: sheet.rowCount, totalColumns: sheet.columnCount };
}

export interface TopBottomBoundary {
  headerRowIndex?: number;
  dataStartRowIndex?: number;
  dataEndRowIndex?: number;
}

/**
 * Extracts a "top N + bottom N" grid preview from an Excel buffer.
 *
 * When a boundary is provided the top/bottom window is computed relative to
 * the selected data range (dataStartRowIndex..dataEndRowIndex) while also
 * including the header row and any rows before dataStartRowIndex that fit
 * in the topN budget. This ensures the preview always reflects the user's
 * current selection.
 *
 * Each entry in the returned `rows` array has an `originalIndex` (0-based)
 * and the cell `data`.
 */
export async function extractExcelGridTopBottom(
  buffer: ArrayBuffer,
  topN: number,
  bottomN: number,
  maxCols: number,
  sheetIndex: number,
  boundary?: TopBottomBoundary,
): Promise<{
  rows: { originalIndex: number; data: string[] }[];
  totalRows: number;
  totalColumns: number;
}> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[sheetIndex] ?? workbook.worksheets[0];
  if (!sheet) return { rows: [], totalRows: 0, totalColumns: 0 };

  const totalRows = sheet.rowCount;
  const totalColumns = Math.min(sheet.columnCount, maxCols);

  const readRow = (r0based: number): string[] => {
    const row = sheet.getRow(r0based + 1);
    const cells: string[] = [];
    for (let c = 1; c <= totalColumns; c++) {
      cells.push(cellToString(row.getCell(c).value));
    }
    return cells;
  };

  const collected = new Set<number>();
  const rows: { originalIndex: number; data: string[] }[] = [];

  const addRow = (idx: number) => {
    if (idx < 0 || idx >= totalRows || collected.has(idx)) return;
    collected.add(idx);
    rows.push({ originalIndex: idx, data: readRow(idx) });
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

  return { rows, totalRows, totalColumns };
}

/**
 * Formats the preview into a concise text table for the LLM prompt.
 */
export function formatPreviewAsText(preview: WorkbookPreview): string {
  const lines: string[] = [];
  lines.push(`Sheet: "${preview.sheetName}" (${preview.totalRows} data rows, ${preview.totalColumns} columns)`);
  lines.push("");
  lines.push("Headers:");
  lines.push(preview.headers.map(collapseMultiline).join(" | "));
  lines.push("");
  lines.push(`Sample data (first ${preview.sampleRows.length} rows):`);
  for (const row of preview.sampleRows) {
    lines.push(row.map(collapseMultiline).join(" | "));
  }
  return lines.join("\n");
}
