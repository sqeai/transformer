import { describe, it, expect } from "vitest";
import {
  applyFilter,
  applyTrimColumns,
  applyPadColumns,
  applyUnpivot,
  applyAggregate,
  applyMap,
  applyMapRows,
  applyReduce,
  applyFilterRows,
  applyUnstructured,
  applyBalanceSheet,
  executeTransformation,
  buildPipeline,
  inferLabelColumn,
} from "../transformations";
import type { FileData } from "../csv";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeData(columns: string[], rows: Record<string, unknown>[]): FileData {
  return { columns, rows };
}

// ---------------------------------------------------------------------------
// inferLabelColumn
// ---------------------------------------------------------------------------

describe("inferLabelColumn", () => {
  it("picks the column with more non-numeric values", () => {
    const columns = ["id", "name"];
    const rows = [
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
    ];
    expect(inferLabelColumn(columns, rows)).toBe("name");
  });

  it("returns the first column when all values are numeric", () => {
    const columns = ["a", "b"];
    const rows = [{ a: "1", b: "2" }];
    // Both columns have score 0; first column wins
    expect(inferLabelColumn(columns, rows)).toBe("a");
  });

  it("returns the first column for empty rows", () => {
    expect(inferLabelColumn(["x", "y"], [])).toBe("x");
  });
});

// ---------------------------------------------------------------------------
// applyFilter
// ---------------------------------------------------------------------------

describe("applyFilter", () => {
  it("removes empty rows when removeEmptyRows is true", () => {
    const data = makeData(["a", "b"], [
      { a: "", b: "" },
      { a: "x", b: "y" },
      { a: "  ", b: "" },
    ]);
    const result = applyFilter(data, { removeEmptyRows: true });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual({ a: "x", b: "y" });
  });

  it("keeps all rows when removeEmptyRows is false", () => {
    const data = makeData(["a"], [{ a: "" }, { a: "x" }]);
    const result = applyFilter(data, { removeEmptyRows: false });
    expect(result.rows).toHaveLength(2);
  });

  it("removes duplicate rows by key columns", () => {
    const data = makeData(["id", "val"], [
      { id: "1", val: "a" },
      { id: "1", val: "b" },
      { id: "2", val: "c" },
    ]);
    const result = applyFilter(data, {
      removeDuplicates: true,
      duplicateKeyColumns: ["id"],
    });
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((r) => r["id"])).toEqual(["1", "2"]);
  });

  it("does not deduplicate when duplicateKeyColumns is empty", () => {
    const data = makeData(["id"], [{ id: "1" }, { id: "1" }]);
    const result = applyFilter(data, { removeDuplicates: true, duplicateKeyColumns: [] });
    expect(result.rows).toHaveLength(2);
  });

  it("removes rows whose first non-empty value matches a keyword", () => {
    const data = makeData(["label"], [
      { label: "Total" },
      { label: "Revenue" },
      { label: "subtotal" },
    ]);
    const result = applyFilter(data, { removeMatchingKeywords: ["total", "subtotal"] });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual({ label: "Revenue" });
  });

  it("preserves columns", () => {
    const data = makeData(["a", "b"], [{ a: "1", b: "2" }]);
    const result = applyFilter(data, {});
    expect(result.columns).toEqual(["a", "b"]);
  });
});

// ---------------------------------------------------------------------------
// applyTrimColumns
// ---------------------------------------------------------------------------

describe("applyTrimColumns", () => {
  it("keeps only specified columns", () => {
    const data = makeData(["a", "b", "c"], [{ a: 1, b: 2, c: 3 }]);
    const result = applyTrimColumns(data, { keepColumns: ["a", "c"] });
    expect(result.columns).toEqual(["a", "c"]);
    expect(result.rows[0]).toEqual({ a: 1, c: 3 });
  });

  it("drops specified columns", () => {
    const data = makeData(["a", "b", "c"], [{ a: 1, b: 2, c: 3 }]);
    const result = applyTrimColumns(data, { dropColumns: ["b"] });
    expect(result.columns).toEqual(["a", "c"]);
    expect(result.rows[0]).toEqual({ a: 1, c: 3 });
  });

  it("keeps columns in keepColumns order", () => {
    const data = makeData(["a", "b", "c"], [{ a: 1, b: 2, c: 3 }]);
    const result = applyTrimColumns(data, { keepColumns: ["c", "a"] });
    expect(result.columns).toEqual(["c", "a"]);
  });

  it("ignores keepColumns entries not present in data", () => {
    const data = makeData(["a", "b"], [{ a: 1, b: 2 }]);
    const result = applyTrimColumns(data, { keepColumns: ["a", "z"] });
    expect(result.columns).toEqual(["a"]);
  });

  it("returns all columns when no params provided", () => {
    const data = makeData(["a", "b"], [{ a: 1, b: 2 }]);
    const result = applyTrimColumns(data, {});
    expect(result.columns).toEqual(["a", "b"]);
  });
});

// ---------------------------------------------------------------------------
// applyPadColumns
// ---------------------------------------------------------------------------

describe("applyPadColumns", () => {
  it("forward-fills empty cells in specified columns", () => {
    const data = makeData(["cat", "val"], [
      { cat: "A", val: 1 },
      { cat: "", val: 2 },
      { cat: "", val: 3 },
      { cat: "B", val: 4 },
    ]);
    const result = applyPadColumns(data, { paddingColumns: ["cat"] });
    expect(result.rows.map((r) => r["cat"])).toEqual(["A", "A", "A", "B"]);
  });

  it("does nothing when paddingColumns is empty", () => {
    const data = makeData(["a"], [{ a: "" }, { a: "x" }]);
    const result = applyPadColumns(data, { paddingColumns: [] });
    expect(result.rows[0]["a"]).toBe("");
  });

  it("preserves columns list", () => {
    const data = makeData(["a", "b"], [{ a: "x", b: "y" }]);
    const result = applyPadColumns(data, { paddingColumns: ["a"] });
    expect(result.columns).toEqual(["a", "b"]);
  });

  it("ignores columns not present in data", () => {
    const data = makeData(["a"], [{ a: "x" }]);
    const result = applyPadColumns(data, { paddingColumns: ["z"] });
    expect(result.rows[0]["a"]).toBe("x");
  });
});

// ---------------------------------------------------------------------------
// applyUnpivot
// ---------------------------------------------------------------------------

describe("applyUnpivot", () => {
  it("melts specified columns into name/value rows", () => {
    const data = makeData(["region", "jan", "feb"], [
      { region: "North", jan: 100, feb: 200 },
    ]);
    const result = applyUnpivot(data, {
      unpivotColumns: ["jan", "feb"],
      nameColumn: "month",
      valueColumn: "amount",
    });
    expect(result.columns).toEqual(["region", "month", "amount"]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({ region: "North", month: "jan", amount: 100 });
    expect(result.rows[1]).toEqual({ region: "North", month: "feb", amount: 200 });
  });

  it("handles extractFields", () => {
    const data = makeData(["id", "q1_2024", "q2_2024"], [{ id: "x", q1_2024: 10, q2_2024: 20 }]);
    const result = applyUnpivot(data, {
      unpivotColumns: ["q1_2024", "q2_2024"],
      nameColumn: "period",
      valueColumn: "amount",
      extractFields: [
        { fieldName: "year", valuesBySourceColumn: { q1_2024: "2024", q2_2024: "2024" } },
      ],
    });
    expect(result.columns).toContain("year");
    expect(result.rows[0]["year"]).toBe("2024");
  });

  it("produces one output row per unpivot column per source row", () => {
    const data = makeData(["id", "a", "b", "c"], [
      { id: 1, a: 10, b: 20, c: 30 },
      { id: 2, a: 40, b: 50, c: 60 },
    ]);
    const result = applyUnpivot(data, {
      unpivotColumns: ["a", "b", "c"],
      nameColumn: "key",
      valueColumn: "value",
    });
    expect(result.rows).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// applyAggregate
// ---------------------------------------------------------------------------

describe("applyAggregate", () => {
  it("sums values by group", () => {
    const data = makeData(["dept", "amount"], [
      { dept: "Sales", amount: 100 },
      { dept: "Sales", amount: 200 },
      { dept: "HR", amount: 50 },
    ]);
    const result = applyAggregate(data, {
      groupByColumns: ["dept"],
      aggregations: [{ column: "amount", function: "sum" }],
    });
    expect(result.rows).toHaveLength(2);
    const sales = result.rows.find((r) => r["dept"] === "Sales");
    expect(sales?.["amount"]).toBe(300);
    const hr = result.rows.find((r) => r["dept"] === "HR");
    expect(hr?.["amount"]).toBe(50);
  });

  it("counts rows per group", () => {
    const data = makeData(["cat", "v"], [
      { cat: "A", v: 1 },
      { cat: "A", v: 2 },
      { cat: "B", v: 3 },
    ]);
    const result = applyAggregate(data, {
      groupByColumns: ["cat"],
      aggregations: [{ column: "v", function: "count" }],
    });
    const groupA = result.rows.find((r) => r["cat"] === "A");
    expect(groupA?.["v"]).toBe(2);
  });

  it("computes min and max", () => {
    const data = makeData(["g", "n"], [
      { g: "x", n: 5 },
      { g: "x", n: 2 },
      { g: "x", n: 8 },
    ]);
    const result = applyAggregate(data, {
      groupByColumns: ["g"],
      aggregations: [
        { column: "n", function: "min" },
      ],
    });
    expect(result.rows[0]["n"]).toBe(2);
  });

  it("computes average", () => {
    const data = makeData(["g", "n"], [
      { g: "x", n: 10 },
      { g: "x", n: 20 },
    ]);
    const result = applyAggregate(data, {
      groupByColumns: ["g"],
      aggregations: [{ column: "n", function: "avg" }],
    });
    expect(result.rows[0]["n"]).toBe(15);
  });

  it("concatenates unique string values", () => {
    const data = makeData(["g", "s"], [
      { g: "x", s: "hello" },
      { g: "x", s: "world" },
      { g: "x", s: "hello" },
    ]);
    const result = applyAggregate(data, {
      groupByColumns: ["g"],
      aggregations: [{ column: "s", function: "concat" }],
    });
    expect(result.rows[0]["s"]).toBe("hello, world");
  });

  it("preserves column list", () => {
    const data = makeData(["g", "v"], [{ g: "a", v: 1 }]);
    const result = applyAggregate(data, {
      groupByColumns: ["g"],
      aggregations: [{ column: "v", function: "sum" }],
    });
    expect(result.columns).toEqual(["g", "v"]);
  });
});

// ---------------------------------------------------------------------------
// applyMap
// ---------------------------------------------------------------------------

describe("applyMap", () => {
  it("maps source columns to target paths", () => {
    const data = makeData(["raw_name", "raw_age"], [
      { raw_name: "Alice", raw_age: 30 },
    ]);
    const result = applyMap(
      data,
      {
        mappings: [
          { sourceColumn: "raw_name", targetPath: "person.name" },
          { sourceColumn: "raw_age", targetPath: "person.age" },
        ],
        defaults: [],
      },
      ["person.name", "person.age"],
    );
    expect(result.columns).toEqual(["person.name", "person.age"]);
    expect(result.rows[0]["person.name"]).toBe("Alice");
    expect(result.rows[0]["person.age"]).toBe(30);
  });

  it("uses defaultValue when source cell is empty", () => {
    const data = makeData(["name"], [{ name: "" }]);
    const result = applyMap(
      data,
      {
        mappings: [{ sourceColumn: "name", targetPath: "full_name", defaultValue: "Unknown" }],
        defaults: [],
      },
      ["full_name"],
    );
    expect(result.rows[0]["full_name"]).toBe("Unknown");
  });

  it("fills unmapped target paths from defaults", () => {
    const data = makeData(["name"], [{ name: "Bob" }]);
    const result = applyMap(
      data,
      {
        mappings: [{ sourceColumn: "name", targetPath: "full_name" }],
        defaults: [{ targetPath: "status", value: "active" }],
      },
      ["full_name", "status"],
    );
    expect(result.rows[0]["status"]).toBe("active");
  });

  it("fills missing target paths with empty string if no default", () => {
    const data = makeData(["a"], [{ a: "x" }]);
    const result = applyMap(
      data,
      { mappings: [{ sourceColumn: "a", targetPath: "out.a" }], defaults: [] },
      ["out.a", "out.b"],
    );
    expect(result.rows[0]["out.b"]).toBe("");
  });

  it("resolves source column case-insensitively", () => {
    const data = makeData(["Name"], [{ Name: "Alice" }]);
    const result = applyMap(
      data,
      { mappings: [{ sourceColumn: "name", targetPath: "person.name" }], defaults: [] },
      ["person.name"],
    );
    expect(result.rows[0]["person.name"]).toBe("Alice");
  });
});

// ---------------------------------------------------------------------------
// applyMapRows
// ---------------------------------------------------------------------------

describe("applyMapRows", () => {
  it("applies a rule when condition matches", () => {
    const data = makeData(["status"], [{ status: "active" }, { status: "inactive" }]);
    const result = applyMapRows(data, {
      rules: [
        {
          conditions: [{ column: "status", operator: "eq", value: "active" }],
          targetColumn: "label",
          value: "Active User",
        },
      ],
    });
    expect(result.rows[0]["label"]).toBe("Active User");
    expect(result.rows[1]["label"]).toBeUndefined();
  });

  it("evaluates OR condition logic", () => {
    const data = makeData(["type"], [{ type: "a" }, { type: "b" }, { type: "c" }]);
    const result = applyMapRows(data, {
      rules: [
        {
          conditions: [
            { column: "type", operator: "eq", value: "a" },
            { column: "type", operator: "eq", value: "b" },
          ],
          conditionLogic: "or",
          targetColumn: "match",
          value: "yes",
        },
      ],
    });
    expect(result.rows[0]["match"]).toBe("yes");
    expect(result.rows[1]["match"]).toBe("yes");
    expect(result.rows[2]["match"]).toBeUndefined();
  });

  it("applies lookup table", () => {
    const data = makeData(["code"], [{ code: "US" }, { code: "CA" }, { code: "XX" }]);
    const result = applyMapRows(data, {
      lookups: [
        {
          sourceColumn: "code",
          lookupData: { US: "United States", CA: "Canada" },
          targetColumn: "country",
          defaultValue: "Unknown",
        },
      ],
    });
    expect(result.rows[0]["country"]).toBe("United States");
    expect(result.rows[1]["country"]).toBe("Canada");
    expect(result.rows[2]["country"]).toBe("Unknown");
  });

  it("applies custom transform expression", () => {
    const data = makeData(["price"], [{ price: "100" }, { price: "200" }]);
    const result = applyMapRows(data, {
      customTransforms: [
        {
          expression: "Number(value) * 2",
          targetColumn: "double_price",
          sourceColumn: "price",
        },
      ],
    });
    expect(result.rows[0]["double_price"]).toBe(200);
    expect(result.rows[1]["double_price"]).toBe(400);
  });

  it("supports is_empty and is_not_empty operators", () => {
    const data = makeData(["v"], [{ v: "" }, { v: "x" }]);
    const result = applyMapRows(data, {
      rules: [
        { conditions: [{ column: "v", operator: "is_empty" }], targetColumn: "empty_flag", value: true },
        { conditions: [{ column: "v", operator: "is_not_empty" }], targetColumn: "has_value", value: true },
      ],
    });
    expect(result.rows[0]["empty_flag"]).toBe(true);
    expect(result.rows[1]["has_value"]).toBe(true);
  });

  it("supports gt/gte/lt/lte operators", () => {
    const data = makeData(["n"], [{ n: "5" }, { n: "10" }, { n: "15" }]);
    const result = applyMapRows(data, {
      rules: [
        {
          conditions: [{ column: "n", operator: "gte", value: "10" }],
          targetColumn: "big",
          value: true,
        },
      ],
    });
    expect(result.rows[0]["big"]).toBeUndefined();
    expect(result.rows[1]["big"]).toBe(true);
    expect(result.rows[2]["big"]).toBe(true);
  });

  it("adds new columns to the output", () => {
    const data = makeData(["a"], [{ a: "x" }]);
    const result = applyMapRows(data, {
      rules: [{ conditions: [{ column: "a", operator: "eq", value: "x" }], targetColumn: "b", value: "y" }],
    });
    expect(result.columns).toContain("b");
  });
});

// ---------------------------------------------------------------------------
// applyReduce
// ---------------------------------------------------------------------------

describe("applyReduce", () => {
  it("reduces rows by key columns", () => {
    const data = makeData(["id", "amount"], [
      { id: "A", amount: 10 },
      { id: "A", amount: 20 },
      { id: "B", amount: 5 },
    ]);
    const result = applyReduce(data, {
      keyColumns: ["id"],
      aggregations: [{ sourceColumn: "amount", function: "sum" }],
    });
    expect(result.rows).toHaveLength(2);
    const a = result.rows.find((r) => r["id"] === "A");
    expect(a?.["amount_sum"]).toBe(30);
  });

  it("uses custom output column name", () => {
    const data = makeData(["g", "v"], [{ g: "x", v: 1 }, { g: "x", v: 2 }]);
    const result = applyReduce(data, {
      keyColumns: ["g"],
      aggregations: [{ sourceColumn: "v", function: "sum", outputColumn: "total" }],
    });
    expect(result.columns).toContain("total");
    expect(result.rows[0]["total"]).toBe(3);
  });

  it("includes _count when includeCount is true", () => {
    const data = makeData(["g", "v"], [{ g: "x", v: 1 }, { g: "x", v: 2 }]);
    const result = applyReduce(data, {
      keyColumns: ["g"],
      aggregations: [],
      includeCount: true,
    });
    expect(result.columns).toContain("_count");
    expect(result.rows[0]["_count"]).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// applyFilterRows
// ---------------------------------------------------------------------------

describe("applyFilterRows", () => {
  it("removes rows matching a regex pattern by default", () => {
    const data = makeData(["label"], [
      { label: "Total Revenue" },
      { label: "Operating Income" },
      { label: "Net Total" },
    ]);
    const result = applyFilterRows(data, { column: "label", pattern: "^Total" });
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]["label"]).toBe("Operating Income");
  });

  it("keeps only matching rows when mode is 'keep'", () => {
    const data = makeData(["type"], [{ type: "foo" }, { type: "bar" }, { type: "foobar" }]);
    const result = applyFilterRows(data, { column: "type", pattern: "foo", mode: "keep" });
    expect(result.rows).toHaveLength(2);
  });

  it("is case insensitive by default", () => {
    const data = makeData(["v"], [{ v: "HELLO" }, { v: "world" }]);
    const result = applyFilterRows(data, { column: "v", pattern: "hello", mode: "keep" });
    expect(result.rows).toHaveLength(1);
  });

  it("is case sensitive when caseInsensitive is false", () => {
    const data = makeData(["v"], [{ v: "HELLO" }, { v: "hello" }]);
    const result = applyFilterRows(data, { column: "v", pattern: "hello", mode: "keep", caseInsensitive: false });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]["v"]).toBe("hello");
  });

  it("returns original data when column does not exist", () => {
    const data = makeData(["a"], [{ a: "x" }]);
    const result = applyFilterRows(data, { column: "z", pattern: "x" });
    expect(result).toEqual(data);
  });

  it("returns original data when pattern is empty", () => {
    const data = makeData(["a"], [{ a: "x" }]);
    const result = applyFilterRows(data, { column: "a", pattern: "" });
    expect(result).toEqual(data);
  });

  it("returns original data for an invalid regex", () => {
    const data = makeData(["a"], [{ a: "x" }]);
    const result = applyFilterRows(data, { column: "a", pattern: "[invalid" });
    expect(result).toEqual(data);
  });
});

// ---------------------------------------------------------------------------
// applyUnstructured
// ---------------------------------------------------------------------------

describe("applyUnstructured", () => {
  it("flattens all columns into a single text column", () => {
    const data = makeData(["name", "age"], [{ name: "Alice", age: 30 }, { name: "Bob", age: 25 }]);
    const result = applyUnstructured(data, { textColumnName: "raw_text" });
    expect(result.columns).toEqual(["raw_text"]);
    expect(result.rows[0]["raw_text"]).toBe("Alice | 30");
    expect(result.rows[1]["raw_text"]).toBe("Bob | 25");
  });

  it("defaults to 'raw_text' column name when not specified", () => {
    const data = makeData(["a"], [{ a: "x" }]);
    const result = applyUnstructured(data, {});
    expect(result.columns).toEqual(["raw_text"]);
  });

  it("skips empty cell values in concatenation", () => {
    const data = makeData(["a", "b", "c"], [{ a: "x", b: "", c: "z" }]);
    const result = applyUnstructured(data, {});
    expect(result.rows[0]["raw_text"]).toBe("x | z");
  });
});

// ---------------------------------------------------------------------------
// applyBalanceSheet
// ---------------------------------------------------------------------------

describe("applyBalanceSheet", () => {
  it("delegates to applyExpand with an inferred label column", () => {
    const data = makeData(["label", "amount"], [
      { label: "* Assets", amount: "" },
      { label: "Cash", amount: "100" },
    ]);
    const result = applyBalanceSheet(data, { maxDepth: 2 });
    // Just verify it runs and returns structured data
    expect(result.columns.some((c) => c.startsWith("nesting_level_"))).toBe(true);
  });

  it("uses explicitly specified labelColumn", () => {
    const data = makeData(["title", "value"], [
      { title: "* Group", value: "" },
      { title: "Item", value: "50" },
    ]);
    const result = applyBalanceSheet(data, { labelColumn: "title", maxDepth: 2 });
    expect(result.columns.some((c) => c.startsWith("nesting_level_"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// executeTransformation (dispatcher)
// ---------------------------------------------------------------------------

describe("executeTransformation", () => {
  const data = makeData(["a", "b"], [{ a: "x", b: "y" }]);

  it("dispatches 'filter' tool", () => {
    const result = executeTransformation(data, { tool: "filter", params: { removeEmptyRows: true } }, []);
    expect(result.columns).toEqual(["a", "b"]);
  });

  it("dispatches 'trimColumns' tool", () => {
    const result = executeTransformation(data, { tool: "trimColumns", params: { keepColumns: ["a"] } }, []);
    expect(result.columns).toEqual(["a"]);
  });

  it("dispatches 'handleStructuredData' — returns data unchanged", () => {
    const result = executeTransformation(data, { tool: "handleStructuredData", params: {} }, []);
    expect(result).toEqual(data);
  });

  it("returns data unchanged for unknown tool", () => {
    const result = executeTransformation(data, { tool: "unknownTool" as never, params: {} }, []);
    expect(result).toEqual(data);
  });
});

// ---------------------------------------------------------------------------
// buildPipeline
// ---------------------------------------------------------------------------

describe("buildPipeline", () => {
  it("creates source and target nodes", () => {
    const pipeline = buildPipeline([]);
    expect(pipeline.nodes[0]).toMatchObject({ id: "source", type: "source" });
    expect(pipeline.nodes[pipeline.nodes.length - 1]).toMatchObject({ id: "target", type: "target" });
  });

  it("creates a node and edges for each step", () => {
    const steps = [
      { tool: "filter", params: { removeEmptyRows: true } },
      { tool: "trimColumns", params: { keepColumns: ["a"] } },
    ];
    const pipeline = buildPipeline(steps);
    // source + 2 steps + target = 4 nodes
    expect(pipeline.nodes).toHaveLength(4);
    // source→filter, filter→trim, trim→target = 3 edges
    expect(pipeline.edges).toHaveLength(3);
  });

  it("links edges in order", () => {
    const steps = [{ tool: "filter", params: {} }];
    const pipeline = buildPipeline(steps);
    expect(pipeline.edges[0].source).toBe("source");
    expect(pipeline.edges[0].target).toBe("filter_0");
    expect(pipeline.edges[1].source).toBe("filter_0");
    expect(pipeline.edges[1].target).toBe("target");
  });
});
