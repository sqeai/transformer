import type { AggregationFunction, ColumnMapping, DefaultValues, PivotConfig } from "./types";

function setByPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
) {
  const parts = path.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const next = (current[key] as Record<string, unknown>) ?? {};
    current[key] = next;
    current = next;
  }
  current[parts[parts.length - 1]!] = value;
}

function getByPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const p of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[p];
  }
  return current;
}

function stringifyValue(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") {
    try { return JSON.stringify(v); } catch { return ""; }
  }
  return String(v);
}

function aggregate(
  values: unknown[],
  fn: AggregationFunction,
): unknown {
  switch (fn) {
    case "sum": {
      let total = 0;
      for (const v of values) {
        const n = Number(v);
        if (!Number.isNaN(n)) total += n;
      }
      return total;
    }
    case "count":
      return values.length;
    case "min": {
      const nums = values.map(Number).filter((n) => !Number.isNaN(n));
      return nums.length > 0 ? Math.min(...nums) : "";
    }
    case "max": {
      const nums = values.map(Number).filter((n) => !Number.isNaN(n));
      return nums.length > 0 ? Math.max(...nums) : "";
    }
    case "concat": {
      const unique = [...new Set(values.map((v) => stringifyValue(v)))];
      return unique.join(", ");
    }
    case "first":
      return values[0] ?? "";
    case "ai_merge":
      return [...new Set(values.map((v) => stringifyValue(v)))].join(", ");
    default:
      return values[0] ?? "";
  }
}

/**
 * Applies column mappings (with optional pivot aggregation) to raw rows.
 * Without pivot: 1:1 row mapping.
 * With pivot: groups by the designated columns and aggregates the rest.
 */
export function applyMappings(
  rawRows: Record<string, unknown>[],
  columnMappings: ColumnMapping[],
  pivotConfig: PivotConfig,
  defaultValues: DefaultValues = {},
): Record<string, unknown>[] {
  if (!pivotConfig.enabled || pivotConfig.groupByColumns.length === 0) {
    return rawRows.map((raw) => {
      const out: Record<string, unknown> = {};
      for (const m of columnMappings) {
        setByPath(out, m.targetPath, raw[m.rawColumn]);
      }
      for (const [path, value] of Object.entries(defaultValues)) {
        setByPath(out, path, value);
      }
      return out;
    });
  }

  const groupBySet = new Set(pivotConfig.groupByColumns);

  const groups = new Map<string, Record<string, unknown>[]>();
  for (const raw of rawRows) {
    const key = pivotConfig.groupByColumns
      .map((col) => String(raw[col] ?? ""))
      .join("|||");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(raw);
  }

  const result: Record<string, unknown>[] = [];
  for (const rows of groups.values()) {
    const out: Record<string, unknown> = {};
    for (const m of columnMappings) {
      if (groupBySet.has(m.rawColumn)) {
        setByPath(out, m.targetPath, rows[0]![m.rawColumn]);
      } else {
        const values = rows.map((r) => r[m.rawColumn]);
        const fn = m.aggregation ?? "sum";
        setByPath(out, m.targetPath, aggregate(values, fn));
      }
    }
    for (const [path, value] of Object.entries(defaultValues)) {
      setByPath(out, path, value);
    }
    result.push(out);
  }

  return result;
}

/**
 * Format a value for display: numbers with more than 4 decimal places
 * are shown truncated to 4 decimals with "..." appended.
 */
export function formatDisplayValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    const str = String(value);
    const dotIndex = str.indexOf(".");
    if (dotIndex !== -1) {
      const decimals = str.length - dotIndex - 1;
      if (decimals > 4) {
        return str.slice(0, dotIndex + 5) + "...";
      }
    }
    return str;
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return String(value);
}

export { getByPath };
