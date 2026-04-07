import * as XLSX from "xlsx";

export interface WorkbookPreview {
  sheetName: string;
  headers: string[];
  sampleRows: string[][];
  totalRows: number;
  totalColumns: number;
}

const MAX_SAMPLE_ROWS = 8;
const MAX_RAW_PREVIEW_ROWS = 30;
/**
 * Upper bound on columns considered when auto-detecting table bounds
 * and building previews for LLMs. Kept reasonably high so wide sheets
 * are fully visible to the schema agents, but still bounded for safety.
 */
const MAX_COLUMNS = 200;

/**
 * Converts xlsx cell value to string
 */
function xlsxCellToString(cell: XLSX.CellObject | undefined): string {
  if (!cell) return "";
  // Use formatted text if available, otherwise raw value
  if (cell.w !== undefined) return String(cell.w).replace(/\r\n/g, "\n").trim();
  if (cell.v === undefined || cell.v === null) return "";
  if (cell.v instanceof Date) return cell.v.toISOString();
  return String(cell.v).replace(/\r\n/g, "\n").trim();
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
  /**
   * 0-based index of the worksheet to analyse (default 0).
   * When omitted, the first sheet is used.
   */
  sheetIndex?: number;
  /** When true, returns all rows from row 1 (including potential metadata/title rows) instead of assuming row 1 is the header. */
  useAllRows?: boolean;
}

interface SheetInfo {
  sheet: XLSX.WorkSheet;
  sheetName: string;
  range: XLSX.Range;
  totalRows: number;
  totalCols: number;
}

/**
 * Helper to get sheet info from a workbook
 */
function getSheetInfo(workbook: XLSX.WorkBook, sheetIndex: number): SheetInfo | null {
  const sheetName = workbook.SheetNames[sheetIndex] ?? workbook.SheetNames[0];
  if (!sheetName) return null;

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return null;

  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
  const totalRows = range.e.r - range.s.r + 1;
  const totalCols = range.e.c - range.s.c + 1;

  return { sheet, sheetName, range, totalRows, totalCols };
}

/**
 * Helper to read a cell value from xlsx sheet
 */
function readCell(sheet: XLSX.WorkSheet, row: number, col: number, range: XLSX.Range): string {
  const cellAddress = XLSX.utils.encode_cell({ r: row + range.s.r, c: col + range.s.c });
  const cell = sheet[cellAddress] as XLSX.CellObject | undefined;
  return xlsxCellToString(cell);
}

/**
 * Detects the largest continuous rectangular table region within a sheet.
 * Scans for the densest block of non-empty cells, trimming surrounding
 * metadata, titles, and other tables on both axes.
 *
 * Returns 1-based { startRow, endRow, startCol, endCol }.
 */
function detectTableBounds(info: SheetInfo): {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
} {
  const totalRows = Math.min(info.totalRows, 500);
  const totalCols = Math.min(info.totalCols, MAX_COLUMNS);

  if (totalRows === 0 || totalCols === 0) {
    return { startRow: 1, endRow: 1, startCol: 1, endCol: 1 };
  }

  const grid: boolean[][] = [];
  for (let r = 0; r < totalRows; r++) {
    const rowFlags: boolean[] = [];
    for (let c = 0; c < totalCols; c++) {
      const val = readCell(info.sheet, r, c, info.range);
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
  const workbook = XLSX.read(buffer, { type: "array", cellStyles: false, cellFormula: false });
  const sheetIndex = options?.sheetIndex ?? 0;
  const info = getSheetInfo(workbook, sheetIndex);

  if (!info) {
    return { sheetName: "", headers: [], sampleRows: [], totalRows: 0, totalColumns: 0 };
  }

  const bounds = detectTableBounds(info);
  const { startRow, endRow, startCol, endCol } = bounds;
  const tableCols = endCol - startCol + 1;

  // Helper to read a row within bounds (1-based row/col from bounds)
  const readBoundedRow = (r1based: number): string[] => {
    const values: string[] = [];
    for (let c = startCol; c <= endCol; c++) {
      // Convert 1-based to 0-based for readCell
      values.push(readCell(info.sheet, r1based - 1, c - 1, info.range));
    }
    return values;
  };

  if (options?.useAllRows) {
    const rowCount = Math.min(endRow - startRow + 1, MAX_RAW_PREVIEW_ROWS);

    const sampleRows: string[][] = [];
    for (let r = startRow; r < startRow + rowCount; r++) {
      const values = readBoundedRow(r).map(collapseMultiline);
      sampleRows.push(values);
    }

    return {
      sheetName: info.sheetName,
      headers: [],
      sampleRows,
      totalRows: endRow - startRow + 1,
      totalColumns: tableCols,
    };
  }

  const rawHeaders = readBoundedRow(startRow);

  const nonEmptyColIndices: number[] = [];
  for (let i = 0; i < rawHeaders.length; i++) {
    if (rawHeaders[i] && rawHeaders[i].length > 0) {
      nonEmptyColIndices.push(i);
    }
  }

  if (nonEmptyColIndices.length === 0) {
    return {
      sheetName: info.sheetName,
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
    const fullRow = readBoundedRow(r);
    const values = nonEmptyColIndices.map((colIdx) => fullRow[colIdx]);
    const allEmpty = values.every((v) => v === "");
    if (!allEmpty) {
      sampleRows.push(values);
    }
  }

  return {
    sheetName: info.sheetName,
    headers,
    sampleRows,
    totalRows: dataRowCount,
    totalColumns: nonEmptyColIndices.length,
  };
}

/**
 * Returns the list of sheet names in an Excel workbook.
 * Uses xlsx (SheetJS) for fast parsing - only reads sheet names, not data.
 */
export async function getExcelSheetNames(buffer: ArrayBuffer): Promise<string[]> {
  const t0 = performance.now();
  console.log("[getExcelSheetNames] Starting with XLSX (SheetJS)...", { bufferSize: buffer.byteLength });

  // Use xlsx with bookSheets option to only read sheet names (fastest)
  const workbook = XLSX.read(buffer, { type: "array", bookSheets: true });
  const t1 = performance.now();
  console.log(`[getExcelSheetNames] XLSX.read() completed: ${(t1 - t0).toFixed(2)}ms`);

  const names = workbook.SheetNames;
  console.log(`[getExcelSheetNames] TOTAL TIME: ${(performance.now() - t0).toFixed(2)}ms (found ${names.length} sheets)`);

  return names;
}

/**
 * Gets lightweight metadata from an Excel file without loading all data.
 */
export async function getExcelMetadata(
  buffer: ArrayBuffer,
  sheetIndex = 0,
): Promise<{
  sheets: Array<{ name: string; rowCount: number; columnCount: number }>;
  activeSheet: { name: string; rowCount: number; columnCount: number };
}> {
  const workbook = XLSX.read(buffer, { type: "array", cellStyles: false, cellFormula: false });

  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    if (!sheet || !sheet["!ref"]) {
      return { name, rowCount: 0, columnCount: 0 };
    }
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    return {
      name,
      rowCount: range.e.r - range.s.r + 1,
      columnCount: range.e.c - range.s.c + 1,
    };
  });

  const activeSheet = sheets[sheetIndex] ?? sheets[0] ?? { name: "", rowCount: 0, columnCount: 0 };

  return { sheets, activeSheet };
}

/**
 * Loads a specific page of rows from an Excel sheet.
 * Optimized for pagination - only loads the requested rows.
 * Skips fully empty rows automatically.
 */
export async function getExcelPagedRows(
  buffer: ArrayBuffer,
  sheetIndex: number,
  startRow: number,
  pageSize: number,
  maxCols = 60,
): Promise<{ rows: string[][]; hasMore: boolean }> {
  const workbook = XLSX.read(buffer, { type: "array", cellStyles: false, cellFormula: false });
  const info = getSheetInfo(workbook, sheetIndex);
  if (!info) return { rows: [], hasMore: false };

  const colCount = Math.min(info.totalCols, maxCols);
  const endRow = Math.min(startRow + pageSize, info.totalRows);

  const rows: string[][] = [];
  for (let r = startRow; r < endRow; r++) {
    const cells: string[] = [];
    for (let c = 0; c < colCount; c++) {
      cells.push(readCell(info.sheet, r, c, info.range));
    }
    // Skip fully empty rows
    const hasValue = cells.some((cell) => cell.trim().length > 0);
    if (hasValue) {
      rows.push(cells);
    }
  }

  return {
    rows,
    hasMore: endRow < info.totalRows,
  };
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
  const workbook = XLSX.read(buffer, { type: "array", cellStyles: false, cellFormula: false });
  const info = getSheetInfo(workbook, sheetIndex);
  if (!info) return { grid: [], totalRows: 0, totalColumns: 0 };

  const rowCount = Math.min(info.totalRows, maxRows);
  const colCount = Math.min(info.totalCols, maxCols);

  const grid: string[][] = [];
  for (let r = 0; r < rowCount; r++) {
    const cells: string[] = [];
    for (let c = 0; c < colCount; c++) {
      cells.push(readCell(info.sheet, r, c, info.range));
    }
    grid.push(cells);
  }

  return { grid, totalRows: info.totalRows, totalColumns: info.totalCols };
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
  const t0 = performance.now();
  console.log("[extractExcelGridTopBottom] Starting with XLSX (SheetJS)...", { bufferSize: buffer.byteLength, topN, bottomN, maxCols, sheetIndex });

  // Use xlsx for fast parsing
  const workbook = XLSX.read(buffer, { type: "array", cellStyles: false, cellFormula: false });
  const t1 = performance.now();
  console.log(`[extractExcelGridTopBottom] XLSX.read() completed: ${(t1 - t0).toFixed(2)}ms`);

  const info = getSheetInfo(workbook, sheetIndex);
  if (!info) return { rows: [], totalRows: 0, totalColumns: 0 };

  const t2 = performance.now();

  const totalRows = info.totalRows;
  const totalColumns = info.totalCols;
  const previewColumns = Math.min(totalColumns, maxCols);

  console.log(`[extractExcelGridTopBottom] Sheet selected: ${(t2 - t1).toFixed(2)}ms`, { sheetName: info.sheetName, totalRows, totalColumns });

  const readRow = (r0based: number): string[] => {
    const cells: string[] = [];
    for (let c = 0; c < previewColumns; c++) {
      cells.push(readCell(info.sheet, r0based, c, info.range));
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

  const t3 = performance.now();

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

  const t4 = performance.now();
  console.log(`[extractExcelGridTopBottom] Rows read (${rows.length} rows): ${(t4 - t3).toFixed(2)}ms`);

  rows.sort((a, b) => a.originalIndex - b.originalIndex);

  const t5 = performance.now();
  console.log(`[extractExcelGridTopBottom] Rows sorted: ${(t5 - t4).toFixed(2)}ms`);
  console.log(`[extractExcelGridTopBottom] TOTAL TIME: ${(t5 - t0).toFixed(2)}ms`);

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
