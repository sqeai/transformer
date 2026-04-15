import { describe, it, expect } from "vitest";
import {
  parseCsvContent,
  escapeCsvCell,
  rowsToCsv,
  fileSummary,
  type FileData,
} from "../csv";

describe("parseCsvContent", () => {
  it("parses a simple CSV", () => {
    const result = parseCsvContent("a,b,c\n1,2,3");
    expect(result).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted fields containing commas", () => {
    const result = parseCsvContent('"hello, world",b\n"foo, bar",baz');
    expect(result).toEqual([
      ["hello, world", "b"],
      ["foo, bar", "baz"],
    ]);
  });

  it("handles escaped quotes inside quoted fields", () => {
    const result = parseCsvContent('"say ""hi""",b');
    expect(result).toEqual([['say "hi"', "b"]]);
  });

  it("handles CRLF line endings", () => {
    const result = parseCsvContent("a,b\r\n1,2");
    expect(result).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles quoted fields containing newlines", () => {
    const result = parseCsvContent('"line1\nline2",b');
    expect(result).toEqual([["line1\nline2", "b"]]);
  });

  it("returns empty array for empty string", () => {
    const result = parseCsvContent("");
    expect(result).toEqual([]);
  });

  it("parses a single row with no newline", () => {
    const result = parseCsvContent("a,b,c");
    expect(result).toEqual([["a", "b", "c"]]);
  });

  it("handles empty fields", () => {
    const result = parseCsvContent("a,,c");
    expect(result).toEqual([["a", "", "c"]]);
  });

  it("handles trailing empty field", () => {
    const result = parseCsvContent("a,b,");
    expect(result).toEqual([["a", "b", ""]]);
  });
});

describe("escapeCsvCell", () => {
  it("returns plain strings unchanged", () => {
    expect(escapeCsvCell("hello")).toBe("hello");
    expect(escapeCsvCell(42)).toBe("42");
  });

  it("wraps strings containing commas in quotes", () => {
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
  });

  it("wraps strings containing double-quotes and escapes them", () => {
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it("wraps strings containing newlines", () => {
    expect(escapeCsvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("handles null and undefined", () => {
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
  });

  it("handles numeric zero", () => {
    expect(escapeCsvCell(0)).toBe("0");
  });
});

describe("rowsToCsv", () => {
  it("produces a header row followed by data rows", () => {
    const columns = ["name", "age"];
    const rows = [
      { name: "Alice", age: 30 },
      { name: "Bob", age: 25 },
    ];
    const csv = rowsToCsv(columns, rows);
    expect(csv).toBe("name,age\nAlice,30\nBob,25");
  });

  it("escapes values that need quoting", () => {
    const columns = ["note"];
    const rows = [{ note: "hello, world" }];
    const csv = rowsToCsv(columns, rows);
    expect(csv).toBe('note\n"hello, world"');
  });

  it("produces only the header for an empty row array", () => {
    const csv = rowsToCsv(["col"], []);
    expect(csv).toBe("col");
  });

  it("outputs empty string for missing column values", () => {
    const columns = ["a", "b"];
    const rows = [{ a: "x" }];
    const csv = rowsToCsv(columns, rows);
    expect(csv).toBe("a,b\nx,");
  });
});

describe("fileSummary", () => {
  it("returns JSON with expected keys", () => {
    const data: FileData = {
      columns: ["name", "value"],
      rows: [
        { name: "Alice", value: 1 },
        { name: "Bob", value: 2 },
      ],
    };
    const summary = JSON.parse(fileSummary(data, 5));
    expect(summary).toMatchObject({
      columns: ["name", "value"],
      rowCount: 2,
      columnCount: 2,
    });
  });

  it("reports empty cell statistics", () => {
    const data: FileData = {
      columns: ["a", "b"],
      rows: [
        { a: "", b: "x" },
        { a: "y", b: "z" },
      ],
    };
    const summary = JSON.parse(fileSummary(data, 5));
    expect(summary.emptyCellsPerColumn["a"]).toBeDefined();
    expect(summary.emptyCellsPerColumn["b"]).toBeUndefined();
  });

  it("limits sample rows to sampleCount", () => {
    const data: FileData = {
      columns: ["n"],
      rows: Array.from({ length: 10 }, (_, i) => ({ n: i })),
    };
    const summary = JSON.parse(fileSummary(data, 3));
    expect(summary.sampleRows).toHaveLength(3);
    expect(summary.rowCount).toBe(10);
  });

  it("handles empty data gracefully", () => {
    const data: FileData = { columns: ["x"], rows: [] };
    const summary = JSON.parse(fileSummary(data, 5));
    expect(summary.rowCount).toBe(0);
    expect(summary.emptyCellsPerColumn).toEqual({});
  });
});
