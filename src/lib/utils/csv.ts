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

export function fileSummary(data: FileData, sampleCount: number): string {
  const sample = data.rows.slice(0, sampleCount);

  const emptyCellStats: Record<string, string> = {};
  for (const col of data.columns) {
    let emptyCount = 0;
    for (const row of data.rows) {
      if (row[col] == null || String(row[col]).trim() === "") emptyCount++;
    }
    if (emptyCount > 0) {
      emptyCellStats[col] = `${emptyCount}/${data.rows.length} empty (${Math.round((emptyCount / Math.max(data.rows.length, 1)) * 100)}%)`;
    }
  }

  return JSON.stringify({
    columns: data.columns,
    rowCount: data.rows.length,
    columnCount: data.columns.length,
    emptyCellsPerColumn: emptyCellStats,
    sampleRows: sample,
  });
}
