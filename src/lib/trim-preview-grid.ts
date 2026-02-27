/**
 * Trims a preview grid conservatively:
 * - Rows are removed ONLY when we can be confident they're completely empty.
 * - Columns are not re-indexed (to keep boundary indices stable); instead we
 *   compute a suggested visible column range you can use as default boundaries.
 *
 * Definitions (within the available preview window):
 * - A row is empty if every cell is empty (null/undefined/whitespace).
 * - A column is empty if every row has an empty cell at that index.
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
  suggestedStartColumn: number;
  suggestedEndColumn: number;
} {
  if (rows.length === 0) {
    return {
      rows: [],
      totalRows,
      totalColumns: 0,
      suggestedStartColumn: 0,
      suggestedEndColumn: 0,
    };
  }

  // We only have data for the preview window (e.g. first N columns).
  // Keep totalColumns bounded to what we actually have, so the UI doesn't
  // render thousands of empty columns.
  const previewColumns = Math.max(...rows.map((r) => r.data.length), 0);
  const boundedTotalColumns = Math.min(Math.max(totalColumns, 0), previewColumns || 0);

  // If the sheet is wider than the preview window, we cannot know whether a row
  // is "completely empty" in the full sheet. In that case, do NOT trim rows.
  const canTrimRows = boundedTotalColumns > 0 && totalColumns <= boundedTotalColumns;
  const trimmedRows = canTrimRows
    ? rows.filter((row) => {
        for (let c = 0; c < boundedTotalColumns; c++) {
          if (!isEmptyCell(row.data[c])) return true;
        }
        return false;
      })
    : rows;

  // Compute a suggested column range by finding the first/last non-empty column
  // in the preview window (do not delete/reindex the underlying data).
  let firstNonEmpty = 0;
  let lastNonEmpty = Math.max(0, boundedTotalColumns - 1);
  if (boundedTotalColumns > 0) {
    let found = false;
    for (let c = 0; c < boundedTotalColumns; c++) {
      const hasContent = trimmedRows.some((r) => !isEmptyCell(r.data[c]));
      if (hasContent) {
        firstNonEmpty = c;
        found = true;
        break;
      }
    }
    for (let c = boundedTotalColumns - 1; c >= 0; c--) {
      const hasContent = trimmedRows.some((r) => !isEmptyCell(r.data[c]));
      if (hasContent) {
        lastNonEmpty = c;
        found = true;
        break;
      }
    }
    if (!found) {
      firstNonEmpty = 0;
      lastNonEmpty = Math.max(0, boundedTotalColumns - 1);
    }
  }

  return {
    rows: trimmedRows,
    totalRows,
    totalColumns: boundedTotalColumns,
    suggestedStartColumn: firstNonEmpty,
    suggestedEndColumn: lastNonEmpty,
  };
}
