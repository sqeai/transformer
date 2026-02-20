/**
 * Simple CSV parser for browser (avoids csv-parse bundle issues).
 * First row = headers, rest = rows as objects.
 */
export function parseCsvToRows(csvText: string): {
  columns: string[];
  rows: Record<string, unknown>[];
} {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 0) return { columns: [], rows: [] };

  const parseRow = (line: string): string[] => {
    const out: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if (inQuotes) {
        current += c;
      } else if (c === ",") {
        out.push(current.trim());
        current = "";
      } else {
        current += c;
      }
    }
    out.push(current.trim());
    return out;
  };

  const headerRow = parseRow(lines[0]!);
  const columns = headerRow.map((h) => h.replace(/^"|"$/g, "").trim() || "Column");

  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseRow(lines[i]!);
    const obj: Record<string, unknown> = {};
    columns.forEach((col, j) => {
      obj[col] = values[j]?.replace(/^"|"$/g, "") ?? "";
    });
    rows.push(obj);
  }

  return { columns, rows };
}
