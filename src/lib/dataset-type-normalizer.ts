import { type SqlCompatibleType } from "./types";

const SUPPORTED_SQL_TYPES = new Set<SqlCompatibleType>([
  "STRING",
  "INTEGER",
  "FLOAT",
  "NUMERIC",
  "BOOLEAN",
  "DATE",
  "DATETIME",
  "TIMESTAMP",
]);

export type SchemaTypeRow = {
  path: string;
  data_type: string | null;
};

export function normalizeSqlType(value: string | null | undefined): SqlCompatibleType {
  const normalized = String(value ?? "STRING").trim().toUpperCase();
  if (SUPPORTED_SQL_TYPES.has(normalized as SqlCompatibleType)) {
    return normalized as SqlCompatibleType;
  }
  return "STRING";
}

export function buildFieldTypeMap(rows: SchemaTypeRow[]): Record<string, SqlCompatibleType> {
  const out: Record<string, SqlCompatibleType> = {};
  for (const row of rows) {
    if (!row.path) continue;
    out[row.path] = normalizeSqlType(row.data_type);
  }
  return out;
}

function normalizeNumericString(value: string): string {
  return value.replace(/,/g, "").trim();
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateOnlyUTC(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDatetimeUTC(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

export function coerceForStorage(value: unknown, type: SqlCompatibleType): unknown {
  if (value === null || value === undefined) return null;

  if (type === "STRING") return String(value);

  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  switch (type) {
    case "INTEGER": {
      if (typeof value === "number") return Number.isInteger(value) ? value : null;
      const normalized = normalizeNumericString(String(value));
      return /^[-+]?\d+$/.test(normalized) ? Number(normalized) : null;
    }
    case "FLOAT": {
      const normalized = normalizeNumericString(String(value));
      if (!normalized) return null;
      const num = Number(normalized);
      return Number.isFinite(num) ? num : null;
    }
    case "NUMERIC": {
      const normalized = normalizeNumericString(String(value));
      if (!normalized) return null;
      return /^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(normalized) ? normalized : null;
    }
    case "BOOLEAN": {
      if (typeof value === "boolean") return value;
      const normalized = String(value).trim().toLowerCase();
      if (["true", "1", "yes", "y"].includes(normalized)) return true;
      if (["false", "0", "no", "n"].includes(normalized)) return false;
      return null;
    }
    case "DATE": {
      const parsed = parseDate(value);
      return parsed ? formatDateOnlyUTC(parsed) : null;
    }
    case "DATETIME": {
      const parsed = parseDate(value);
      return parsed ? formatDatetimeUTC(parsed) : null;
    }
    case "TIMESTAMP": {
      const parsed = parseDate(value);
      return parsed ? parsed.toISOString() : null;
    }
    default:
      return String(value);
  }
}

export function normalizeRowsForStorage(
  rows: Record<string, unknown>[],
  fieldTypeMap: Record<string, SqlCompatibleType>,
): Record<string, unknown>[] {
  return rows.map((row) => {
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      const type = fieldTypeMap[key] ?? "STRING";
      clean[key] = coerceForStorage(value, type);
    }
    return clean;
  });
}
