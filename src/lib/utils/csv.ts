import { promises as fs } from "fs";

export interface FileData {
  columns: string[];
  rows: Record<string, unknown>[];
}

export function parseCsvContent(input: string): string[][] {
  const rows: string[][] = [];
  let currentField = "";
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const nextCh = i + 1 < input.length ? input[i + 1] : "";

    if (ch === "\"") {
      if (inQuotes && nextCh === "\"") {
        currentField += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      currentRow.push(currentField);
      currentField = "";
      continue;
    }

    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && nextCh === "\n") i += 1;
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = "";
      continue;
    }

    currentField += ch;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

export function escapeCsvCell(value: unknown): string {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

export function rowsToCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const lines: string[] = [columns.map(escapeCsvCell).join(",")];
  for (const row of rows) {
    lines.push(columns.map((col) => escapeCsvCell(row[col])).join(","));
  }
  return lines.join("\n");
}

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

export function fileSummary(data: FileData, sampleCount: number): string {
  const sample = data.rows.slice(0, sampleCount);
  return JSON.stringify({
    columns: data.columns,
    rowCount: data.rows.length,
    columnCount: data.columns.length,
    sampleRows: sample,
  });
}
