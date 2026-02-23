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
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value) return String((value as { text: string }).text).trim();
    if ("result" in value) {
      const r = (value as { result: unknown }).result;
      return r != null ? String(r).trim() : "";
    }
    if ("richText" in value) {
      return (value as ExcelJS.CellRichTextValue).richText
        .map((seg) => seg.text)
        .join("")
        .trim();
    }
  }
  return String(value).trim();
}

export interface ExtractOptions {
  /** When true, returns all rows from row 1 (including potential metadata/title rows) instead of assuming row 1 is the header. */
  useAllRows?: boolean;
}

/**
 * Trims a workbook down to a compact preview suitable for LLM consumption.
 * Strips empty columns, limits row count, and returns a structured summary.
 *
 * When `useAllRows` is true, all rows (up to MAX_RAW_PREVIEW_ROWS) are returned
 * in `sampleRows` with `headers` left empty — useful for LLM-based header detection.
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

  if (options?.useAllRows) {
    const rowCount = Math.min(sheet.rowCount, MAX_RAW_PREVIEW_ROWS);
    const maxCol = Math.min(sheet.columnCount, MAX_COLUMNS);

    const sampleRows: string[][] = [];
    for (let r = 1; r <= rowCount; r++) {
      const row = sheet.getRow(r);
      const values: string[] = [];
      for (let c = 1; c <= maxCol; c++) {
        values.push(cellToString(row.getCell(c).value));
      }
      sampleRows.push(values);
    }

    return {
      sheetName: sheet.name,
      headers: [],
      sampleRows,
      totalRows: sheet.rowCount,
      totalColumns: maxCol,
    };
  }

  const headerRow = sheet.getRow(1);
  const rawHeaders: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    if (colNumber <= MAX_COLUMNS) {
      rawHeaders[colNumber - 1] = cellToString(cell.value);
    }
  });

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
      totalRows: sheet.rowCount - 1,
      totalColumns: 0,
    };
  }

  const headers = nonEmptyColIndices.map((i) => rawHeaders[i]);

  const dataRowCount = Math.max(0, sheet.rowCount - 1);
  const sampleCount = Math.min(MAX_SAMPLE_ROWS, dataRowCount);

  const sampleRows: string[][] = [];
  for (let r = 2; r <= 1 + sampleCount; r++) {
    const row = sheet.getRow(r);
    const values = nonEmptyColIndices.map((colIdx) =>
      cellToString(row.getCell(colIdx + 1).value),
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
 * Formats the preview into a concise text table for the LLM prompt.
 */
export function formatPreviewAsText(preview: WorkbookPreview): string {
  const lines: string[] = [];
  lines.push(`Sheet: "${preview.sheetName}" (${preview.totalRows} data rows, ${preview.totalColumns} columns)`);
  lines.push("");
  lines.push("Headers:");
  lines.push(preview.headers.join(" | "));
  lines.push("");
  lines.push(`Sample data (first ${preview.sampleRows.length} rows):`);
  for (const row of preview.sampleRows) {
    lines.push(row.join(" | "));
  }
  return lines.join("\n");
}
