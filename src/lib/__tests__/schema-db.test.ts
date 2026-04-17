import { describe, it, expect } from "vitest";
import { rowsToFields, fieldsToRows, type SchemaFieldRow } from "../schema-db";
import type { SchemaField } from "../types";

function makeRow(overrides: Partial<SchemaFieldRow> = {}): SchemaFieldRow {
  return {
    id: "1",
    schema_id: "schema-1",
    name: "field",
    path: "field",
    level: 1,
    order: 0,
    description: null,
    default_value: null,
    data_type: "STRING",
    parent_id: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// rowsToFields
// ---------------------------------------------------------------------------

describe("rowsToFields", () => {
  it("returns an empty array for no rows", () => {
    expect(rowsToFields([])).toEqual([]);
  });

  it("creates a root field from a single flat row", () => {
    const rows = [makeRow({ id: "1", name: "name", path: "name", level: 1 })];
    const fields = rowsToFields(rows);
    expect(fields).toHaveLength(1);
    expect(fields[0].name).toBe("name");
    expect(fields[0].children).toEqual([]);
  });

  it("assigns correct dataType from data_type column", () => {
    const rows = [makeRow({ data_type: "INTEGER" })];
    const fields = rowsToFields(rows);
    expect(fields[0].dataType).toBe("INTEGER");
  });

  it("defaults dataType to STRING for unknown types", () => {
    const rows = [makeRow({ data_type: "NVARCHAR" })];
    const fields = rowsToFields(rows);
    expect(fields[0].dataType).toBe("STRING");
  });

  it("defaults dataType to STRING for null data_type", () => {
    const rows = [makeRow({ data_type: null })];
    const fields = rowsToFields(rows);
    expect(fields[0].dataType).toBe("STRING");
  });

  it("maps optional fields from row", () => {
    const rows = [makeRow({ description: "A field", default_value: "42" })];
    const fields = rowsToFields(rows);
    expect(fields[0].description).toBe("A field");
    expect(fields[0].defaultValue).toBe("42");
  });

  it("builds parent–child hierarchy", () => {
    const rows = [
      makeRow({ id: "parent", name: "parent", path: "parent", parent_id: null, level: 1, order: 0 }),
      makeRow({ id: "child", name: "child", path: "parent.child", parent_id: "parent", level: 2, order: 0 }),
    ];
    const fields = rowsToFields(rows);
    expect(fields).toHaveLength(1);
    expect(fields[0].children).toHaveLength(1);
    expect(fields[0].children![0].name).toBe("child");
  });

  it("adds orphaned children (missing parent) as root nodes", () => {
    const rows = [
      makeRow({ id: "child", name: "child", path: "child", parent_id: "nonexistent", level: 2, order: 0 }),
    ];
    const fields = rowsToFields(rows);
    expect(fields).toHaveLength(1);
    expect(fields[0].name).toBe("child");
  });

  it("sorts siblings by order", () => {
    const rows = [
      makeRow({ id: "b", name: "b", path: "b", order: 1 }),
      makeRow({ id: "a", name: "a", path: "a", order: 0 }),
    ];
    const fields = rowsToFields(rows);
    expect(fields[0].name).toBe("a");
    expect(fields[1].name).toBe("b");
  });

  it("handles multiple levels of nesting", () => {
    const rows = [
      makeRow({ id: "root", name: "root", path: "root", parent_id: null, level: 1, order: 0 }),
      makeRow({ id: "mid", name: "mid", path: "root.mid", parent_id: "root", level: 2, order: 0 }),
      makeRow({ id: "leaf", name: "leaf", path: "root.mid.leaf", parent_id: "mid", level: 3, order: 0 }),
    ];
    const fields = rowsToFields(rows);
    expect(fields[0].children![0].children![0].name).toBe("leaf");
  });
});

// ---------------------------------------------------------------------------
// fieldsToRows
// ---------------------------------------------------------------------------

describe("fieldsToRows", () => {
  function makeField(overrides: Partial<SchemaField> = {}): SchemaField {
    return {
      id: "f1",
      name: "field1",
      path: "field1",
      level: 1,
      order: 0,
      dataType: "STRING",
      ...overrides,
    };
  }

  it("returns an empty array for no fields", () => {
    expect(fieldsToRows("schema-1", [])).toEqual([]);
  });

  it("serializes a single flat field", () => {
    const fields = [makeField()];
    const rows = fieldsToRows("schema-1", fields);
    expect(rows).toHaveLength(1);
    expect(rows[0].schema_id).toBe("schema-1");
    expect(rows[0].name).toBe("field1");
    expect(rows[0].parent_id).toBeNull();
    expect(rows[0].level).toBe(1);
  });

  it("serializes nested children with correct parent_id and level", () => {
    const fields = [
      makeField({
        id: "root",
        name: "root",
        path: "root",
        children: [
          makeField({ id: "child", name: "child", path: "root.child", level: 2, order: 0 }),
        ],
      }),
    ];
    const rows = fieldsToRows("schema-1", fields);
    expect(rows).toHaveLength(2);
    const childRow = rows.find((r) => r.id === "child");
    expect(childRow?.parent_id).toBe("root");
    expect(childRow?.level).toBe(2);
  });

  it("reassigns order based on sorted position", () => {
    const fields = [
      makeField({ id: "b", name: "b", order: 10 }),
      makeField({ id: "a", name: "a", order: 0 }),
    ];
    const rows = fieldsToRows("schema-1", fields);
    const aRow = rows.find((r) => r.id === "a")!;
    const bRow = rows.find((r) => r.id === "b")!;
    expect(aRow.order).toBe(0);
    expect(bRow.order).toBe(1);
  });

  it("maps optional fields correctly", () => {
    const fields = [makeField({ description: "desc", defaultValue: "default" })];
    const rows = fieldsToRows("schema-1", fields);
    expect(rows[0].description).toBe("desc");
    expect(rows[0].default_value).toBe("default");
  });

  it("defaults missing description and defaultValue to null", () => {
    const fields = [makeField({ description: undefined, defaultValue: undefined })];
    const rows = fieldsToRows("schema-1", fields);
    expect(rows[0].description).toBeNull();
    expect(rows[0].default_value).toBeNull();
  });

  it("round-trips: rowsToFields(fieldsToRows()) preserves structure", () => {
    const original: SchemaField[] = [
      {
        id: "p",
        name: "parent",
        path: "parent",
        level: 1,
        order: 0,
        dataType: "STRING",
        children: [
          { id: "c", name: "child", path: "parent.child", level: 2, order: 0, dataType: "INTEGER" },
        ],
      },
    ];
    const rows = fieldsToRows("s1", original);
    const restored = rowsToFields(rows);
    expect(restored[0].name).toBe("parent");
    expect(restored[0].children![0].name).toBe("child");
    expect(restored[0].children![0].dataType).toBe("INTEGER");
  });
});
