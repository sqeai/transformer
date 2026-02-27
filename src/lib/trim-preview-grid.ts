/**
 * Trims completely empty rows and columns from a preview grid.
 * A row is empty if every cell is empty (null/undefined/whitespace).
 * A column is empty if every row has an empty cell at that index.
 */

export interface IndexedPreviewRow {
  originalIndex: number;
  data: string[];
}

function isEmptyCell(val: unknown): boolean {
  if (val == null) return true;
  return String(val).trim() === "";
}

export function trimEmptyRowsAndColumns(
  rows: IndexedPreviewRow[],
  totalRows: number,
  totalColumns: number,
): {
  rows: IndexedPreviewRow[];
  totalRows: number;
  totalColumns: number;
} {
  if (rows.length === 0) return { rows: [], totalRows: 0, totalColumns: 0 };

  const maxCol = Math.max(
    totalColumns,
    ...rows.map((r) => r.data.length),
    1,
  );

  const nonEmptyColIndices: number[] = [];
  for (let c = 0; c < maxCol; c++) {
    const hasContent = rows.some((r) => !isEmptyCell(r.data[c]));
    if (hasContent) nonEmptyColIndices.push(c);
  }

  const trimmedRows = rows.filter((row) =>
    nonEmptyColIndices.some((c) => !isEmptyCell(row.data[c])),
  );

  const trimmedData: IndexedPreviewRow[] = trimmedRows.map((row) => ({
    originalIndex: row.originalIndex,
    data: nonEmptyColIndices.map((c) => row.data[c] ?? ""),
  }));

  return {
    rows: trimmedData,
    totalRows: trimmedData.length,
    totalColumns: nonEmptyColIndices.length,
  };
}
