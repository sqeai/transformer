import ExcelJS from "exceljs";
import type { RawDataAnalysis } from "./llm-schema";

const MAX_DETECT_ROWS = 500;
const MAX_DETECT_COLS = 60;

function extractCellText(v: ExcelJS.CellValue, fallback: string): string {
  let raw: string;
  if (typeof v === "string") {
    raw = v;
  } else if (v && typeof v === "object" && "richText" in v) {
    raw = (v as ExcelJS.CellRichTextValue).richText
      .map((seg) => seg.text)
      .join("");
  } else if (v && typeof v === "object" && "text" in v) {
    raw = String((v as { text: string }).text);
  } else if (v != null) {
    raw = String(v);
  } else {
    return fallback;
  }
  raw = raw.replace(/\r\n/g, "\n").trim();
  return raw || fallback;
}

function cellToStringSimple(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("richText" in value)
      return (value as ExcelJS.CellRichTextValue).richText.map((s) => s.text).join("").trim();
    if ("text" in value) return String((value as { text: string }).text).trim();
    if ("result" in value) {
      const r = (value as { result: unknown }).result;
      return r != null ? String(r).trim() : "";
    }
  }
  return String(value).trim();
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
function detectTableBounds(sheet: ExcelJS.Worksheet): {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
} {
  const totalRows = Math.min(sheet.rowCount, MAX_DETECT_ROWS);
  const totalCols = Math.min(sheet.columnCount, MAX_DETECT_COLS);

  if (totalRows === 0 || totalCols === 0) {
    return { startRow: 1, endRow: 1, startCol: 1, endCol: 1 };
  }

  const grid: boolean[][] = [];
  for (let r = 1; r <= totalRows; r++) {
    const row = sheet.getRow(r);
    const rowFlags: boolean[] = [];
    for (let c = 1; c <= totalCols; c++) {
      rowFlags.push(cellToStringSimple(row.getCell(c).value).length > 0);
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

export async function parseExcelColumns(buffer: ArrayBuffer): Promise<string[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const bounds = detectTableBounds(sheet);
  const row = sheet.getRow(bounds.startRow);
  const cols: string[] = [];
  for (let c = bounds.startCol; c <= bounds.endCol; c++) {
    cols.push(extractCellText(row.getCell(c).value, `Column ${c}`));
  }
  return cols;
}

export interface ParseOptions {
  analysis?: RawDataAnalysis;
  headerRowIndex?: number;
  headerRowCount?: number;
  dataStartRowIndex?: number;
  dataEndRowIndex?: number;
  columnsToKeep?: number[];
  /** 0-based sheet index (default 0). Only this sheet is parsed. */
  sheetIndex?: number;
}

/**
 * Parses an Excel file into columns + rows.
 * When an `analysis` is provided, uses the LLM-detected header row and column filter.
 * Otherwise, auto-detects the main table region within the sheet.
 */
export async function parseExcelToRows(
  buffer: ArrayBuffer,
  options?: ParseOptions,
): Promise<{
  columns: string[];
  rows: Record<string, unknown>[];
}> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheetIndex = options?.sheetIndex ?? 0;
  const sheet = workbook.worksheets[sheetIndex] ?? workbook.worksheets[0];
  if (!sheet) return { columns: [], rows: [] };

  const analysis = options?.analysis;

  let baseHeaderRowNum: number;
  let baseHeaderRowCount: number;
  let baseDataStartRowNum: number;
  let baseLastDataRow: number;
  let baseColumnsToKeep: number[] | undefined;

  if (analysis) {
    baseHeaderRowNum = analysis.headerRowIndex + 1;
    baseHeaderRowCount = analysis.headerRowCount ?? 1;
    baseDataStartRowNum = analysis.dataStartRowIndex + 1;
    baseLastDataRow = sheet.rowCount;
    baseColumnsToKeep = analysis.columnsToKeep;
  } else {
    const bounds = detectTableBounds(sheet);
    baseHeaderRowNum = bounds.startRow;
    baseHeaderRowCount = 1;
    baseDataStartRowNum = bounds.startRow + 1;
    baseLastDataRow = bounds.endRow;

    const colIndices: number[] = [];
    for (let c = bounds.startCol; c <= bounds.endCol; c++) {
      colIndices.push(c - 1);
    }
    baseColumnsToKeep = colIndices;
  }

  const headerRowNum = options?.headerRowIndex != null ? options.headerRowIndex + 1 : baseHeaderRowNum;
  const headerRowCount = options?.headerRowCount ?? baseHeaderRowCount;
  const dataStartRowNum = options?.dataStartRowIndex != null ? options.dataStartRowIndex + 1 : baseDataStartRowNum;
  const lastDataRow = options?.dataEndRowIndex != null ? options.dataEndRowIndex + 1 : baseLastDataRow;
  const columnsToKeep = options?.columnsToKeep ?? baseColumnsToKeep;

  const headerRow = sheet.getRow(headerRowNum);
  const allColumns: { colIdx: number; name: string }[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    if (columnsToKeep && !columnsToKeep.includes(colNumber - 1)) return;
    let name = extractCellText(cell.value, `Column_${colNumber}`);

    if (headerRowCount > 1) {
      const parts = [name];
      for (let extra = 1; extra < headerRowCount; extra++) {
        const extraRow = sheet.getRow(headerRowNum + extra);
        const extraText = extractCellText(extraRow.getCell(colNumber).value, "");
        if (extraText && extraText !== name) parts.push(extraText);
      }
      name = parts.filter(Boolean).join("\n");
    }

    allColumns.push({ colIdx: colNumber, name });
  });

  const columns = allColumns.map((c) => c.name);

  const rows: Record<string, unknown>[] = [];
  for (let i = dataStartRowNum; i <= lastDataRow; i++) {
    const row = sheet.getRow(i);
    const obj: Record<string, unknown> = {};
    let hasValue = false;
    allColumns.forEach(({ colIdx, name }) => {
      const cell = row.getCell(colIdx);
      let val: unknown = cell.value;
      if (val != null && typeof val === "object" && "result" in val) {
        val = (val as { result: unknown }).result;
      }
      if (val != null && typeof val === "object" && "text" in val) {
        val = (val as { text: string }).text;
      }
      obj[name] = val ?? "";
      if (val != null && val !== "") hasValue = true;
    });
    if (hasValue) rows.push(obj);
  }
  return { columns, rows };
}
