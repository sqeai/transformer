import { describe, it, expect } from "vitest";
import {
  normalizeSqlType,
  buildFieldTypeMap,
  coerceForStorage,
  normalizeRowsForStorage,
  type SchemaTypeRow,
} from "../dataset-type-normalizer";

// ---------------------------------------------------------------------------
// normalizeSqlType
// ---------------------------------------------------------------------------

describe("normalizeSqlType", () => {
  it("returns supported types unchanged (uppercased)", () => {
    const supported = ["STRING", "INTEGER", "FLOAT", "NUMERIC", "BOOLEAN", "DATE", "DATETIME", "TIMESTAMP"] as const;
    for (const t of supported) {
      expect(normalizeSqlType(t)).toBe(t);
    }
  });

  it("uppercases lowercase input", () => {
    expect(normalizeSqlType("integer")).toBe("INTEGER");
    expect(normalizeSqlType("string")).toBe("STRING");
  });

  it("falls back to STRING for unsupported types", () => {
    expect(normalizeSqlType("NVARCHAR")).toBe("STRING");
    expect(normalizeSqlType("TEXT")).toBe("STRING");
    expect(normalizeSqlType("BIGINT")).toBe("STRING");
  });

  it("falls back to STRING for null", () => {
    expect(normalizeSqlType(null)).toBe("STRING");
  });

  it("falls back to STRING for undefined", () => {
    expect(normalizeSqlType(undefined)).toBe("STRING");
  });

  it("falls back to STRING for empty string", () => {
    expect(normalizeSqlType("")).toBe("STRING");
  });
});

// ---------------------------------------------------------------------------
// buildFieldTypeMap
// ---------------------------------------------------------------------------

describe("buildFieldTypeMap", () => {
  it("builds a map from path to normalized type", () => {
    const rows: SchemaTypeRow[] = [
      { path: "name", data_type: "STRING" },
      { path: "age", data_type: "INTEGER" },
    ];
    const map = buildFieldTypeMap(rows);
    expect(map).toEqual({ name: "STRING", age: "INTEGER" });
  });

  it("normalizes unknown types to STRING", () => {
    const rows: SchemaTypeRow[] = [{ path: "col", data_type: "BIGINT" }];
    const map = buildFieldTypeMap(rows);
    expect(map["col"]).toBe("STRING");
  });

  it("skips rows with empty path", () => {
    const rows: SchemaTypeRow[] = [{ path: "", data_type: "INTEGER" }];
    const map = buildFieldTypeMap(rows);
    expect(Object.keys(map)).toHaveLength(0);
  });

  it("returns an empty object for empty input", () => {
    expect(buildFieldTypeMap([])).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// coerceForStorage
// ---------------------------------------------------------------------------

describe("coerceForStorage", () => {
  it("returns null for null input regardless of type", () => {
    expect(coerceForStorage(null, "STRING")).toBeNull();
    expect(coerceForStorage(null, "INTEGER")).toBeNull();
  });

  it("returns null for undefined input regardless of type", () => {
    expect(coerceForStorage(undefined, "INTEGER")).toBeNull();
  });

  // STRING
  describe("STRING", () => {
    it("converts values to string", () => {
      expect(coerceForStorage(42, "STRING")).toBe("42");
      expect(coerceForStorage(true, "STRING")).toBe("true");
      expect(coerceForStorage("hello", "STRING")).toBe("hello");
    });
  });

  // INTEGER
  describe("INTEGER", () => {
    it("accepts integer numbers", () => {
      expect(coerceForStorage(5, "INTEGER")).toBe(5);
    });

    it("returns null for float numbers", () => {
      expect(coerceForStorage(3.14, "INTEGER")).toBeNull();
    });

    it("parses integer strings", () => {
      expect(coerceForStorage("42", "INTEGER")).toBe(42);
      expect(coerceForStorage("-7", "INTEGER")).toBe(-7);
    });

    it("strips commas from numeric strings", () => {
      expect(coerceForStorage("1,000", "INTEGER")).toBe(1000);
    });

    it("returns null for non-integer strings", () => {
      expect(coerceForStorage("3.14", "INTEGER")).toBeNull();
      expect(coerceForStorage("abc", "INTEGER")).toBeNull();
    });

    it("returns null for blank strings", () => {
      expect(coerceForStorage("", "INTEGER")).toBeNull();
      expect(coerceForStorage("  ", "INTEGER")).toBeNull();
    });
  });

  // FLOAT
  describe("FLOAT", () => {
    it("parses float strings", () => {
      expect(coerceForStorage("3.14", "FLOAT")).toBeCloseTo(3.14);
      expect(coerceForStorage("-2.5", "FLOAT")).toBe(-2.5);
    });

    it("strips commas from numeric strings", () => {
      expect(coerceForStorage("1,234.56", "FLOAT")).toBeCloseTo(1234.56);
    });

    it("returns null for non-numeric strings", () => {
      expect(coerceForStorage("abc", "FLOAT")).toBeNull();
    });

    it("returns null for blank strings", () => {
      expect(coerceForStorage("", "FLOAT")).toBeNull();
    });
  });

  // NUMERIC
  describe("NUMERIC", () => {
    it("returns the string value for valid numeric strings", () => {
      expect(coerceForStorage("123.45", "NUMERIC")).toBe("123.45");
      expect(coerceForStorage("100", "NUMERIC")).toBe("100");
    });

    it("returns null for non-numeric strings", () => {
      expect(coerceForStorage("abc", "NUMERIC")).toBeNull();
    });

    it("returns null for blank strings", () => {
      expect(coerceForStorage("", "NUMERIC")).toBeNull();
    });
  });

  // BOOLEAN
  describe("BOOLEAN", () => {
    it("passes through boolean values", () => {
      expect(coerceForStorage(true, "BOOLEAN")).toBe(true);
      expect(coerceForStorage(false, "BOOLEAN")).toBe(false);
    });

    it("coerces truthy strings", () => {
      expect(coerceForStorage("true", "BOOLEAN")).toBe(true);
      expect(coerceForStorage("1", "BOOLEAN")).toBe(true);
      expect(coerceForStorage("yes", "BOOLEAN")).toBe(true);
      expect(coerceForStorage("y", "BOOLEAN")).toBe(true);
    });

    it("coerces falsy strings", () => {
      expect(coerceForStorage("false", "BOOLEAN")).toBe(false);
      expect(coerceForStorage("0", "BOOLEAN")).toBe(false);
      expect(coerceForStorage("no", "BOOLEAN")).toBe(false);
      expect(coerceForStorage("n", "BOOLEAN")).toBe(false);
    });

    it("returns null for unrecognized strings", () => {
      expect(coerceForStorage("maybe", "BOOLEAN")).toBeNull();
    });

    it("returns null for blank string", () => {
      expect(coerceForStorage("", "BOOLEAN")).toBeNull();
    });
  });

  // DATE
  describe("DATE", () => {
    it("formats a valid date string as YYYY-MM-DD", () => {
      // Use a UTC-safe date string
      expect(coerceForStorage("2024-01-15T00:00:00.000Z", "DATE")).toBe("2024-01-15");
    });

    it("returns null for an invalid date", () => {
      expect(coerceForStorage("not-a-date", "DATE")).toBeNull();
    });

    it("returns null for blank string", () => {
      expect(coerceForStorage("", "DATE")).toBeNull();
    });
  });

  // DATETIME
  describe("DATETIME", () => {
    it("formats a valid datetime as YYYY-MM-DD HH:MM:SS", () => {
      expect(coerceForStorage("2024-03-15T12:30:45.000Z", "DATETIME")).toBe("2024-03-15 12:30:45");
    });

    it("returns null for invalid datetime", () => {
      expect(coerceForStorage("garbage", "DATETIME")).toBeNull();
    });
  });

  // TIMESTAMP
  describe("TIMESTAMP", () => {
    it("returns ISO string for a valid date", () => {
      const result = coerceForStorage("2024-06-01T00:00:00.000Z", "TIMESTAMP");
      expect(result).toBe("2024-06-01T00:00:00.000Z");
    });

    it("returns null for invalid timestamp", () => {
      expect(coerceForStorage("not-a-date", "TIMESTAMP")).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// normalizeRowsForStorage
// ---------------------------------------------------------------------------

describe("normalizeRowsForStorage", () => {
  it("applies type coercion to each column using the field type map", () => {
    const rows = [{ name: "Alice", age: "30", active: "true" }];
    const typeMap = { name: "STRING" as const, age: "INTEGER" as const, active: "BOOLEAN" as const };
    const result = normalizeRowsForStorage(rows, typeMap);
    expect(result[0]["name"]).toBe("Alice");
    expect(result[0]["age"]).toBe(30);
    expect(result[0]["active"]).toBe(true);
  });

  it("falls back to STRING for columns not in the type map", () => {
    const rows = [{ value: 42 }];
    const result = normalizeRowsForStorage(rows, {});
    expect(result[0]["value"]).toBe("42");
  });

  it("returns empty array for empty input", () => {
    expect(normalizeRowsForStorage([], {})).toEqual([]);
  });
});
