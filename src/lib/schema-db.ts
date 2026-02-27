import { SQL_COMPATIBLE_TYPES, type SchemaField, type SqlCompatibleType } from "./types";

const SQL_COMPATIBLE_TYPE_SET = new Set<string>(SQL_COMPATIBLE_TYPES);

function normalizeSqlType(value: string | null): SqlCompatibleType {
  const normalized = String(value ?? "").trim().toUpperCase();
  return SQL_COMPATIBLE_TYPE_SET.has(normalized) ? (normalized as SqlCompatibleType) : "STRING";
}

export interface SchemaFieldRow {
  id: string;
  schema_id: string;
  name: string;
  path: string;
  level: number;
  order: number;
  description: string | null;
  default_value: string | null;
  data_type: string | null;
  parent_id: string | null;
}

/** Build SchemaField tree from flat rows (ordered by level, order). */
export function rowsToFields(rows: SchemaFieldRow[]): SchemaField[] {
  const byId = new Map<string, SchemaField>();
  for (const r of rows) {
    byId.set(r.id, {
      id: r.id,
      name: r.name,
      path: r.path,
      level: r.level,
      order: r.order,
      description: r.description ?? undefined,
      defaultValue: r.default_value ?? undefined,
      dataType: normalizeSqlType(r.data_type),
      children: [],
    });
  }
  const roots: SchemaField[] = [];
  for (const r of rows) {
    const node = byId.get(r.id)!;
    if (r.parent_id == null) {
      roots.push(node);
    } else {
      const parent = byId.get(r.parent_id);
      if (parent) {
        parent.children = parent.children ?? [];
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }
  }
  const sortChildren = (nodes: SchemaField[]) => {
    nodes.sort((a, b) => a.order - b.order);
    nodes.forEach((n) => {
      if (n.children?.length) sortChildren(n.children);
    });
  };
  sortChildren(roots);
  return roots;
}

/** Flatten SchemaField tree to rows for insert. */
export function fieldsToRows(
  schemaId: string,
  fields: SchemaField[],
  parentId: string | null = null,
  level = 1,
): { id: string; schema_id: string; name: string; path: string; level: number; order: number; description: string | null; default_value: string | null; data_type: string | null; parent_id: string | null }[] {
  const result: { id: string; schema_id: string; name: string; path: string; level: number; order: number; description: string | null; default_value: string | null; data_type: string | null; parent_id: string | null }[] = [];
  const sorted = [...fields].sort((a, b) => a.order - b.order);
  sorted.forEach((f, index) => {
    result.push({
      id: f.id,
      schema_id: schemaId,
      name: f.name,
      path: f.path,
      level,
      order: index,
      description: f.description ?? null,
      default_value: f.defaultValue ?? null,
      data_type: f.dataType ?? "STRING",
      parent_id: parentId,
    });
    if (f.children?.length) {
      result.push(...fieldsToRows(schemaId, f.children, f.id, level + 1));
    }
  });
  return result;
}
