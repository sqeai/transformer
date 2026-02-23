import ExcelJS from "exceljs";
import type { RawDataAnalysis } from "./llm-schema";

function extractCellText(v: ExcelJS.CellValue, fallback: string): string {
  if (typeof v === "string") return v.trim() || fallback;
  if (v && typeof v === "object" && "text" in v)
    return String((v as { text: string }).text).trim() || fallback;
  if (v != null) return String(v).trim() || fallback;
  return fallback;
}

export async function parseExcelColumns(buffer: ArrayBuffer): Promise<string[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const row = sheet.getRow(1);
  const cols: string[] = [];
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cols.push(extractCellText(cell.value, `Column ${colNumber}`));
  });
  return cols;
}

export interface ParseOptions {
  analysis?: RawDataAnalysis;
}

/**
 * Parses an Excel file into columns + rows.
 * When an `analysis` is provided, uses the LLM-detected header row and column filter
 * instead of assuming row 1 is the header.
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
  const sheet = workbook.worksheets[0];
  if (!sheet) return { columns: [], rows: [] };

  const analysis = options?.analysis;
  const headerRowNum = analysis ? analysis.headerRowIndex + 1 : 1;
  const dataStartRowNum = analysis ? analysis.dataStartRowIndex + 1 : 2;
  const columnsToKeep = analysis?.columnsToKeep;

  const headerRow = sheet.getRow(headerRowNum);
  const allColumns: { colIdx: number; name: string }[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    if (columnsToKeep && !columnsToKeep.includes(colNumber - 1)) return;
    allColumns.push({
      colIdx: colNumber,
      name: extractCellText(cell.value, `Column_${colNumber}`),
    });
  });

  const columns = allColumns.map((c) => c.name);

  const rows: Record<string, unknown>[] = [];
  for (let i = dataStartRowNum; i <= sheet.rowCount; i++) {
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
