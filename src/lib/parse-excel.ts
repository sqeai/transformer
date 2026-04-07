import * as XLSX from "xlsx";

const MAX_DETECT_ROWS = 500;
/**
 * Upper bound on columns considered when auto-detecting table bounds.
 * Increased so very wide sheets expose all columns to downstream
 * consumers (e.g. LLM schema/header detection).
 */
const MAX_DETECT_COLS = 200;

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
 * Get cell value preserving type (for data rows)
 */
function xlsxCellValue(cell: XLSX.CellObject | undefined): unknown {
  if (!cell) return "";
  if (cell.v === undefined || cell.v === null) return "";
  return cell.v;
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
 * Helper to read a cell value from xlsx sheet as string
 */
function readCell(sheet: XLSX.WorkSheet, row: number, col: number, range: XLSX.Range): string {
  const cellAddress = XLSX.utils.encode_cell({ r: row + range.s.r, c: col + range.s.c });
  const cell = sheet[cellAddress] as XLSX.CellObject | undefined;
  return xlsxCellToString(cell);
}

/**
 * Helper to read a cell value from xlsx sheet preserving type
 */
function readCellValue(sheet: XLSX.WorkSheet, row: number, col: number, range: XLSX.Range): unknown {
  const cellAddress = XLSX.utils.encode_cell({ r: row + range.s.r, c: col + range.s.c });
  const cell = sheet[cellAddress] as XLSX.CellObject | undefined;
  return xlsxCellValue(cell);
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
 * Detects the largest continuous rectangular table region within a sheet.
 * Returns 1-based { startRow, endRow, startCol, endCol }.
 */
function detectTableBounds(info: SheetInfo): {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
} {
  const totalRows = Math.min(info.totalRows, MAX_DETECT_ROWS);
  const totalCols = Math.min(info.totalCols, MAX_DETECT_COLS);

  if (totalRows === 0 || totalCols === 0) {
    return { startRow: 1, endRow: 1, startCol: 1, endCol: 1 };
  }

  const grid: boolean[][] = [];
  for (let r = 0; r < totalRows; r++) {
    const rowFlags: boolean[] = [];
    for (let c = 0; c < totalCols; c++) {
      rowFlags.push(readCell(info.sheet, r, c, info.range).length > 0);
    }
    grid.push(rowFlags);
  }

  const rowFillCounts = grid.map((row) => row.filter(Boolean).length);
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

export async function parseExcelColumns(buffer: ArrayBuffer, sheetIndex = 0): Promise<string[]> {
  const workbook = XLSX.read(buffer, { type: "array", cellStyles: false, cellFormula: false });
  const info = getSheetInfo(workbook, sheetIndex);
  if (!info) return [];

  const bounds = detectTableBounds(info);
  const cols: string[] = [];

  // Read header row (bounds.startRow is 1-based, convert to 0-based)
  for (let c = 0; c < info.totalCols; c++) {
    const text = readCell(info.sheet, bounds.startRow - 1, c, info.range);
    cols.push(text || `Column ${c + 1}`);
  }
  return cols;
}

export interface ParseOptions {
  headerRowIndex?: number;
  dataStartRowIndex?: number;
  dataEndRowIndex?: number;
  columnsToKeep?: number[];
  /** 0-based sheet index (default 0). Only this sheet is parsed. */
  sheetIndex?: number;
}

/**
 * Parses an Excel file into columns + rows using the provided boundary options.
 * When boundary options are given they are used directly; otherwise auto-detects
 * the main table region within the sheet.
 */
export async function parseExcelToRows(
  buffer: ArrayBuffer,
  options?: ParseOptions,
): Promise<{
  columns: string[];
  rows: Record<string, unknown>[];
}> {
  const workbook = XLSX.read(buffer, { type: "array", cellStyles: false, cellFormula: false });
  const sheetIndex = options?.sheetIndex ?? 0;
  const info = getSheetInfo(workbook, sheetIndex);
  if (!info) return { columns: [], rows: [] };

  let headerRowNum: number; // 0-based
  let dataStartRowNum: number; // 0-based
  let lastDataRow: number; // 0-based
  let columnsToKeep: number[] | undefined;

  if (options?.headerRowIndex != null) {
    headerRowNum = options.headerRowIndex;
    dataStartRowNum = options.dataStartRowIndex ?? headerRowNum + 1;
    lastDataRow = options.dataEndRowIndex ?? info.totalRows - 1;
    columnsToKeep = options.columnsToKeep;
  } else {
    const bounds = detectTableBounds(info);
    // bounds are 1-based, convert to 0-based
    headerRowNum = bounds.startRow - 1;
    dataStartRowNum = bounds.startRow;
    lastDataRow = bounds.endRow - 1;

    const colIndices: number[] = [];
    for (let c = bounds.startCol - 1; c < bounds.endCol; c++) {
      colIndices.push(c);
    }
    columnsToKeep = colIndices;
  }

  // Read header row
  const allColumns: { colIdx: number; name: string }[] = [];
  for (let c = 0; c < info.totalCols; c++) {
    if (columnsToKeep && !columnsToKeep.includes(c)) continue;
    const text = readCell(info.sheet, headerRowNum, c, info.range);
    const name = text || `Column_${c + 1}`;
    allColumns.push({ colIdx: c, name });
  }

  const columns = allColumns.map((c) => c.name);

  const rows: Record<string, unknown>[] = [];
  for (let r = dataStartRowNum; r <= lastDataRow; r++) {
    const obj: Record<string, unknown> = {};
    let hasValue = false;
    allColumns.forEach(({ colIdx, name }) => {
      const val = readCellValue(info.sheet, r, colIdx, info.range);
      obj[name] = val ?? "";
      if (val != null && val !== "") hasValue = true;
    });
    if (hasValue) rows.push(obj);
  }
  return { columns, rows };
}
