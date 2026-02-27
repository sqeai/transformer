export interface DataCleansingPlan {
  paddingColumns: string[];
  removeEmptyRows: boolean;
  removeTotalRows: boolean;
  totalRowKeywords: string[];
  flattenHierarchy?: boolean;
  hierarchyMaxDepth?: number;
  hierarchyLabelColumn?: string;
  hierarchyValueColumn?: string;
}

export interface AddedCell {
  rowIndex: number;
  colIndex: number;
}

export interface RemovedRow {
  originalRowIndex: number;
  row: string[];
}

export interface CleansedTableResult {
  cleanedColumns: string[];
  cleanedRows: Record<string, unknown>[];
  addedCells: AddedCell[];
  removedRows: RemovedRow[];
}

function isEmptyValue(value: unknown): boolean {
  if (value == null) return true;
  const text = String(value).trim();
  return text === "";
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isTotalLikeRow(
  row: Record<string, unknown>,
  columns: string[],
  keywords: string[],
): boolean {
  const firstNonEmpty = columns
    .map((column) => row[column])
    .find((value) => !isEmptyValue(value));
  if (firstNonEmpty == null) return false;
  const text = normalizeText(firstNonEmpty);
  if (!text) return false;
  return keywords.some((keyword) => {
    const normalized = normalizeText(keyword);
    if (!normalized) return false;
    return text === normalized || text.startsWith(`${normalized} `) || text.includes(` ${normalized}`);
  });
}

function rowToStringArray(row: Record<string, unknown>, columns: string[]): string[] {
  return columns.map((column) => String(row[column] ?? ""));
}

function stripHierarchyLabel(value: unknown): string {
  const raw = String(value ?? "");
  return raw
    .replace(/^\s*[*#\-\u2022]+\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

const HEADER_KEYWORD_RE = /\b(asset|assets|aset|liabilit(?:y|ies|as)?|liability|liabilities|shareholder'?s equity|equity|ekuitas|modal)\b/i;

function getLeadingWhitespaceCount(value: string): number {
  const match = value.match(/^\s+/);
  return match?.[0]?.length ?? 0;
}

function parseHierarchyLevelHints(labels: string[]): {
  starLevelByCount: Map<number, number>;
  indentLevelByWidth: Map<number, number>;
} {
  const starCounts = Array.from(
    new Set(
      labels
        .map((label) => {
          const match = label.match(/^\s*(\*+)\s*/);
          return match ? match[1].length : 0;
        })
        .filter((count) => count > 0),
    ),
  ).sort((a, b) => b - a);

  const starLevelByCount = new Map<number, number>();
  starCounts.forEach((count, index) => {
    starLevelByCount.set(count, index + 1);
  });

  const indentWidths = Array.from(
    new Set(
      labels
        .map((label) => getLeadingWhitespaceCount(label))
        .filter((width) => width > 0),
    ),
  ).sort((a, b) => a - b);

  const indentLevelByWidth = new Map<number, number>();
  indentWidths.forEach((width, index) => {
    indentLevelByWidth.set(width, index + 2);
  });

  return { starLevelByCount, indentLevelByWidth };
}

function isNumericLike(value: unknown): boolean {
  const text = String(value ?? "").trim();
  if (!text) return false;
  const normalized = text.replace(/[,\s]/g, "").replace(/[()]/g, "");
  return /^-?\d+(\.\d+)?$/.test(normalized);
}

function inferLabelColumn(columns: string[], rows: Record<string, unknown>[]): string {
  let bestColumn = columns[0];
  let bestScore = -1;
  for (const column of columns) {
    let textCount = 0;
    for (const row of rows) {
      const value = row[column];
      if (isEmptyValue(value)) continue;
      if (!isNumericLike(value)) textCount += 1;
    }
    if (textCount > bestScore) {
      bestScore = textCount;
      bestColumn = column;
    }
  }
  return bestColumn;
}

function inferValueColumn(columns: string[], rows: Record<string, unknown>[], labelColumn: string): string {
  const candidates = columns.filter((column) => column !== labelColumn);
  if (candidates.length === 0) return labelColumn;
  let bestColumn = candidates[candidates.length - 1];
  let bestScore = -1;
  for (const column of candidates) {
    let numericCount = 0;
    for (const row of rows) {
      if (isNumericLike(row[column])) numericCount += 1;
    }
    if (numericCount > bestScore) {
      bestScore = numericCount;
      bestColumn = column;
    }
  }
  return bestColumn;
}

function looksHierarchicalTable(rows: Record<string, unknown>[], columns: string[]): boolean {
  if (rows.length < 3 || columns.length < 2) return false;
  const labelColumn = inferLabelColumn(columns, rows);
  let markerRows = 0;
  let codedRows = 0;
  let numericRows = 0;
  let headerKeywordRows = 0;
  let headerPatternRows = 0;
  const valueColumn = inferValueColumn(columns, rows, labelColumn);

  for (const row of rows) {
    const label = String(row[labelColumn] ?? "");
    const normalized = stripHierarchyLabel(label);
    if (!normalized) continue;
    const hasStar = /^\s*\*+/.test(label);
    const hasIndent = getLeadingWhitespaceCount(label) > 0;
    if (hasStar || hasIndent) markerRows += 1;
    if (/^\d{3,}/.test(normalized)) codedRows += 1;
    if (isNumericLike(row[valueColumn])) numericRows += 1;
    if (HEADER_KEYWORD_RE.test(normalized)) headerKeywordRows += 1;
    if ((hasStar || /[,;:]$/.test(normalized)) && !/^\d{3,}/.test(normalized)) headerPatternRows += 1;
  }

  return (
    numericRows >= 2 &&
    ((markerRows >= 2 && codedRows >= 2) || (headerKeywordRows >= 1 && (markerRows >= 1 || headerPatternRows >= 1)))
  );
}

function flattenHierarchicalRows(
  rows: Record<string, unknown>[],
  columns: string[],
  plan: DataCleansingPlan,
): { flattenedColumns: string[]; flattenedRows: Record<string, unknown>[] } {
  const labelColumn = plan.hierarchyLabelColumn && columns.includes(plan.hierarchyLabelColumn)
    ? plan.hierarchyLabelColumn
    : inferLabelColumn(columns, rows);
  const valueColumn = plan.hierarchyValueColumn && columns.includes(plan.hierarchyValueColumn)
    ? plan.hierarchyValueColumn
    : inferValueColumn(columns, rows, labelColumn);
  const maxDepth = Math.max(2, Math.min(8, plan.hierarchyMaxDepth ?? 4));

  const rawLabels = rows.map((row) => String(row[labelColumn] ?? ""));
  const { starLevelByCount, indentLevelByWidth } = parseHierarchyLevelHints(rawLabels);
  const stack: string[] = Array(maxDepth).fill("");
  const levels: number[] = [];
  const isHeaderLikeByRow: boolean[] = [];

  const isHeaderLike = (rawLabel: string, normalized: string): boolean => {
    if (!normalized) return false;
    if (HEADER_KEYWORD_RE.test(normalized)) return true;
    if (/^\s*\*+/.test(rawLabel) && !/^\d{3,}/.test(normalized)) return true;
    if (/[,;:]$/.test(normalized) && !/^\d{3,}/.test(normalized)) return true;
    return false;
  };

  const detectLevel = (rawLabel: string, previousLevel: number): number => {
    const starMatch = rawLabel.match(/^\s*(\*+)\s*/);
    if (starMatch) {
      const count = starMatch[1].length;
      return starLevelByCount.get(count) ?? 1;
    }
    const leading = getLeadingWhitespaceCount(rawLabel);
    if (leading > 0) {
      const hinted = indentLevelByWidth.get(leading);
      if (hinted != null) return Math.max(1, Math.min(maxDepth, hinted));
      return Math.max(1, Math.min(maxDepth, Math.floor(leading / 2) + 1));
    }
    const normalized = stripHierarchyLabel(rawLabel);
    if (isHeaderLike(rawLabel, normalized)) {
      return 1;
    }
    if (/^\d{3,}/.test(normalized)) {
      return Math.max(1, Math.min(maxDepth, previousLevel + 1));
    }
    return Math.max(1, Math.min(maxDepth, previousLevel));
  };

  let previousLevel = 1;
  for (let i = 0; i < rows.length; i++) {
    const rawLabel = String(rows[i][labelColumn] ?? "");
    const normalized = stripHierarchyLabel(rawLabel);
    isHeaderLikeByRow.push(isHeaderLike(rawLabel, normalized));
    if (!normalized) {
      levels.push(previousLevel);
      continue;
    }
    const level = detectLevel(rawLabel, previousLevel);
    levels.push(level);
    previousLevel = level;
  }

  const flattenedColumns = Array.from({ length: maxDepth }, (_, i) => `nesting_level_${i + 1}`).concat(["value"]);
  const flattenedRows: Record<string, unknown>[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rawLabel = String(rows[i][labelColumn] ?? "");
    const label = stripHierarchyLabel(rawLabel);
    if (!label) continue;
    const level = Math.max(1, Math.min(maxDepth, levels[i] ?? 1));
    stack[level - 1] = label;
    for (let d = level; d < maxDepth; d++) {
      stack[d] = "";
    }

    let nextLevel = 0;
    let nextHeaderLike = false;
    for (let j = i + 1; j < rows.length; j++) {
      const nextLabel = stripHierarchyLabel(rows[j][labelColumn]);
      if (!nextLabel) continue;
      nextLevel = levels[j] ?? 1;
      nextHeaderLike = isHeaderLikeByRow[j] ?? false;
      break;
    }
    const isCurrentHeaderLike = isHeaderLikeByRow[i] ?? false;
    const isLeaf = nextLevel <= level && !(isCurrentHeaderLike && nextHeaderLike);
    if (!isLeaf) continue;

    const out: Record<string, unknown> = {};
    for (let d = 0; d < maxDepth; d++) {
      out[`nesting_level_${d + 1}`] = stack[d] ?? "";
    }
    out.value = rows[i][valueColumn] ?? "";
    flattenedRows.push(out);
  }

  return { flattenedColumns, flattenedRows };
}

export function applyDataCleansingPlan(
  rows: Record<string, unknown>[],
  columns: string[],
  plan: DataCleansingPlan,
): CleansedTableResult {
  if (rows.length === 0 || columns.length === 0) {
    return { cleanedColumns: columns, cleanedRows: rows, addedCells: [], removedRows: [] };
  }

  const paddingSet = new Set(plan.paddingColumns.filter((column) => columns.includes(column)));
  const carryForwardByColumn = new Map<string, unknown>();
  const paddedRows = rows.map((row) => ({ ...row }));
  const paddedByOriginalIndex = new Map<number, number[]>();

  for (let rowIndex = 0; rowIndex < paddedRows.length; rowIndex++) {
    const row = paddedRows[rowIndex];
    for (let colIndex = 0; colIndex < columns.length; colIndex++) {
      const column = columns[colIndex];
      const currentValue = row[column];
      if (paddingSet.has(column) && isEmptyValue(currentValue) && carryForwardByColumn.has(column)) {
        row[column] = carryForwardByColumn.get(column);
        const existing = paddedByOriginalIndex.get(rowIndex) ?? [];
        existing.push(colIndex);
        paddedByOriginalIndex.set(rowIndex, existing);
      }
      if (!isEmptyValue(row[column])) {
        carryForwardByColumn.set(column, row[column]);
      }
    }
  }

  const cleanedRows: Record<string, unknown>[] = [];
  const addedCells: AddedCell[] = [];
  const removedRows: RemovedRow[] = [];

  for (let originalRowIndex = 0; originalRowIndex < paddedRows.length; originalRowIndex++) {
    const row = paddedRows[originalRowIndex];
    const isEmptyRow = columns.every((column) => isEmptyValue(row[column]));
    const isTotalRow =
      plan.removeTotalRows &&
      isTotalLikeRow(
        row,
        columns,
        plan.totalRowKeywords.length > 0
          ? plan.totalRowKeywords
          : ["total", "subtotal", "grand total", "jumlah"],
      );
    if ((plan.removeEmptyRows && isEmptyRow) || isTotalRow) {
      removedRows.push({
        originalRowIndex,
        row: rowToStringArray(row, columns),
      });
      continue;
    }

    const cleanedRowIndex = cleanedRows.length;
    cleanedRows.push(row);
    const paddedColumns = paddedByOriginalIndex.get(originalRowIndex) ?? [];
    for (const colIndex of paddedColumns) {
      addedCells.push({ rowIndex: cleanedRowIndex, colIndex });
    }
  }
  if (plan.flattenHierarchy || looksHierarchicalTable(cleanedRows, columns)) {
    const { flattenedColumns, flattenedRows } = flattenHierarchicalRows(cleanedRows, columns, plan);
    return {
      cleanedColumns: flattenedColumns,
      cleanedRows: flattenedRows,
      addedCells: [],
      removedRows,
    };
  }

  return { cleanedColumns: columns, cleanedRows, addedCells, removedRows };
}
