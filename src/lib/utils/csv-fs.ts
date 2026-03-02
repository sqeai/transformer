import { promises as fs } from "fs";
import { type FileData, parseCsvContent, rowsToCsv } from "./csv";

export async function readLocalCsv(localPath: string): Promise<FileData> {
  const csvText = await fs.readFile(localPath, "utf8");
  const matrix = parseCsvContent(csvText);
  if (matrix.length === 0) return { columns: [], rows: [] };

  const rawColumns = matrix[0].map((c, idx) => {
    const name = String(c ?? "").trim();
    return name || `column_${idx + 1}`;
  });
  const seen = new Map<string, number>();
  const columns = rawColumns.map((col) => {
    const count = seen.get(col) ?? 0;
    seen.set(col, count + 1);
    return count === 0 ? col : `${col}_${count + 1}`;
  });

  const rows: Record<string, unknown>[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const source = matrix[r];
    const out: Record<string, unknown> = {};
    let hasAnyValue = false;
    for (let c = 0; c < columns.length; c++) {
      const value = source[c] ?? "";
      out[columns[c]] = value;
      if (String(value).trim() !== "") hasAnyValue = true;
    }
    if (hasAnyValue) rows.push(out);
  }
  return { columns, rows };
}

export function writeLocalCsv(localPath: string, columns: string[], rows: Record<string, unknown>[]): Promise<void> {
  return fs.writeFile(localPath, rowsToCsv(columns, rows), "utf8");
}
