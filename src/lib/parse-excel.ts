import ExcelJS from "exceljs";

export async function parseExcelColumns(buffer: ArrayBuffer): Promise<string[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const row = sheet.getRow(1);
  const cols: string[] = [];
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const v = cell.value;
    const text =
      typeof v === "string"
        ? v
        : v && typeof v === "object" && "text" in v
          ? String((v as { text: string }).text)
          : v != null
            ? String(v)
            : `Column ${colNumber}`;
    cols.push(text.trim() || `Column ${colNumber}`);
  });
  return cols;
}

export async function parseExcelToRows(buffer: ArrayBuffer): Promise<{
  columns: string[];
  rows: Record<string, unknown>[];
}> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { columns: [], rows: [] };
  const firstRow = sheet.getRow(1);
  const columns: string[] = [];
  firstRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const v = cell.value;
    const text =
      typeof v === "string"
        ? v
        : v && typeof v === "object" && "text" in v
          ? String((v as { text: string }).text)
          : v != null
            ? String(v)
            : `Column_${colNumber}`;
    columns.push(text.trim() || `Column_${colNumber}`);
  });
  const rows: Record<string, unknown>[] = [];
  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const obj: Record<string, unknown> = {};
    columns.forEach((col, idx) => {
      const cell = row.getCell(idx + 1);
      let val: unknown = cell.value;
      if (val != null && typeof val === "object" && "result" in val) {
        val = (val as { result: unknown }).result;
      }
      if (val != null && typeof val === "object" && "text" in val) {
        val = (val as { text: string }).text;
      }
      obj[col] = val ?? "";
    });
    rows.push(obj);
  }
  return { columns, rows };
}
