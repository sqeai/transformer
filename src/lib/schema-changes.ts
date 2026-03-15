import type { SchemaField } from "./types";

export interface SchemaChange {
  type: "add" | "remove" | "rename" | "type_change";
  columnName: string;
  newColumnName?: string;
  oldDataType?: string;
  newDataType?: string;
}

/**
 * Detect changes between old and new schema fields.
 * Uses field IDs to track identity across renames.
 * Only looks at leaf fields (no children).
 */
export function detectSchemaChanges(
  oldFields: SchemaField[],
  newFields: SchemaField[],
): SchemaChange[] {
  const oldLeaves = flattenLeaves(oldFields);
  const newLeaves = flattenLeaves(newFields);

  const oldById = new Map(oldLeaves.map((f) => [f.id, f]));
  const newById = new Map(newLeaves.map((f) => [f.id, f]));

  const changes: SchemaChange[] = [];

  for (const [id, newField] of newById) {
    const oldField = oldById.get(id);
    if (!oldField) {
      changes.push({
        type: "add",
        columnName: sanitizeColumnName(newField.name),
        newDataType: newField.dataType || "STRING",
      });
      continue;
    }

    const oldName = sanitizeColumnName(oldField.name);
    const newName = sanitizeColumnName(newField.name);
    if (oldName !== newName) {
      changes.push({
        type: "rename",
        columnName: oldName,
        newColumnName: newName,
      });
    }

    const oldType = oldField.dataType || "STRING";
    const newType = newField.dataType || "STRING";
    if (oldType !== newType) {
      changes.push({
        type: "type_change",
        columnName: newName,
        oldDataType: oldType,
        newDataType: newType,
      });
    }
  }

  for (const [id, oldField] of oldById) {
    if (!newById.has(id)) {
      changes.push({
        type: "remove",
        columnName: sanitizeColumnName(oldField.name),
      });
    }
  }

  return changes;
}

function flattenLeaves(fields: SchemaField[]): SchemaField[] {
  const result: SchemaField[] = [];
  for (const f of fields) {
    if (f.children?.length) {
      result.push(...flattenLeaves(f.children));
    } else {
      result.push(f);
    }
  }
  return result;
}

function sanitizeColumnName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

/**
 * Generate BigQuery DDL statements for a set of schema changes.
 * `fqn` is the fully-qualified table name, e.g. `` `dataset.table` ``
 */
export function generateBigQueryDDL(
  fqn: string,
  changes: SchemaChange[],
): string[] {
  const statements: string[] = [];

  for (const change of changes) {
    switch (change.type) {
      case "add":
        statements.push(
          `ALTER TABLE ${fqn} ADD COLUMN ${change.columnName} ${change.newDataType ?? "STRING"}`,
        );
        break;
      case "remove":
        statements.push(
          `ALTER TABLE ${fqn} DROP COLUMN IF EXISTS ${change.columnName}`,
        );
        break;
      case "rename":
        statements.push(
          `ALTER TABLE ${fqn} RENAME COLUMN ${change.columnName} TO ${change.newColumnName}`,
        );
        break;
      case "type_change":
        statements.push(
          `ALTER TABLE ${fqn} ALTER COLUMN ${change.columnName} SET DATA TYPE ${change.newDataType ?? "STRING"}`,
        );
        break;
    }
  }

  return statements;
}

/**
 * Human-readable descriptions of schema changes for the warning dialog.
 */
export function describeChanges(changes: SchemaChange[]): string[] {
  return changes.map((c) => {
    switch (c.type) {
      case "add":
        return `Add column "${c.columnName}" (${c.newDataType})`;
      case "remove":
        return `Remove column "${c.columnName}"`;
      case "rename":
        return `Rename column "${c.columnName}" to "${c.newColumnName}"`;
      case "type_change":
        return `Change type of "${c.columnName}" from ${c.oldDataType} to ${c.newDataType}`;
    }
  });
}
