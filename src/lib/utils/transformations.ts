import type { FileData } from "./csv";
import type { PipelineDescriptor } from "../schema-store";

export interface TransformationStep {
  tool: string;
  params: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function aggregateValues(values: unknown[], fn: string): unknown {
  switch (fn) {
    case "sum": {
      let total = 0;
      for (const v of values) { const n = Number(v); if (!Number.isNaN(n)) total += n; }
      return total;
    }
    case "count": return values.length;
    case "min": { const nums = values.map(Number).filter((n) => !Number.isNaN(n)); return nums.length > 0 ? Math.min(...nums) : ""; }
    case "max": { const nums = values.map(Number).filter((n) => !Number.isNaN(n)); return nums.length > 0 ? Math.max(...nums) : ""; }
    case "avg": { const nums = values.map(Number).filter((n) => !Number.isNaN(n)); return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : ""; }
    case "concat": return [...new Set(values.map((v) => String(v ?? "")).filter(Boolean))].join(", ");
    case "first": return values[0] ?? "";
    default: return values[0] ?? "";
  }
}

export function inferLabelColumn(columns: string[], rows: Record<string, unknown>[]): string {
  let best = columns[0] ?? "";
  let bestScore = -1;
  for (const col of columns) {
    let score = 0;
    for (const row of rows) {
      const v = String(row[col] ?? "").trim();
      if (v && !/^-?\d+([.,]\d+)?$/.test(v.replace(/[\s,]/g, ""))) score += 1;
    }
    if (score > bestScore) { bestScore = score; best = col; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Individual transformations
// ---------------------------------------------------------------------------

export function applyFilter(data: FileData, params: Record<string, unknown>): FileData {
  let filtered = [...data.rows];
  if (params.removeEmptyRows) {
    filtered = filtered.filter((row) =>
      data.columns.some((col) => { const v = row[col]; return v != null && String(v).trim() !== ""; }),
    );
  }
  const dupCols = Array.isArray(params.duplicateKeyColumns) ? params.duplicateKeyColumns as string[] : [];
  if (params.removeDuplicates && dupCols.length > 0) {
    const seen = new Set<string>();
    filtered = filtered.filter((row) => {
      const key = dupCols.map((col) => String(row[col] ?? "")).join("|||");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  const keywords = Array.isArray(params.removeMatchingKeywords) ? (params.removeMatchingKeywords as string[]).map((k) => String(k).toLowerCase()) : [];
  if (keywords.length > 0) {
    filtered = filtered.filter((row) => {
      const first = data.columns.map((col) => row[col]).find((v) => v != null && String(v).trim() !== "");
      if (first == null) return true;
      const text = String(first).toLowerCase().trim();
      return !keywords.some((kw) => text.includes(kw));
    });
  }
  return { columns: data.columns, rows: filtered };
}

export function applyTrimColumns(data: FileData, params: Record<string, unknown>): FileData {
  const keepColumns = params.keepColumns as string[] | undefined;
  const dropColumns = params.dropColumns as string[] | undefined;

  let columns = data.columns;
  if (keepColumns && keepColumns.length > 0) {
    columns = keepColumns.filter((c) => data.columns.includes(c));
  } else if (dropColumns && dropColumns.length > 0) {
    const dropSet = new Set(dropColumns);
    columns = data.columns.filter((c) => !dropSet.has(c));
  }

  const rows = data.rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const col of columns) out[col] = row[col];
    return out;
  });
  return { columns, rows };
}

export function applyPadColumns(data: FileData, params: Record<string, unknown>): FileData {
  const paddingColumns = params.paddingColumns as string[];
  if (!paddingColumns || paddingColumns.length === 0) return data;

  const paddingSet = new Set(paddingColumns.filter((c) => data.columns.includes(c)));
  const carryForward = new Map<string, unknown>();
  const rows = data.rows.map((row) => {
    const out = { ...row };
    for (const col of paddingSet) {
      const val = out[col];
      if ((val == null || String(val).trim() === "") && carryForward.has(col)) {
        out[col] = carryForward.get(col);
      }
      const current = out[col];
      if (current != null && String(current).trim() !== "") {
        carryForward.set(col, current);
      }
    }
    return out;
  });
  return { columns: data.columns, rows };
}

export function applyUnpivot(data: FileData, params: Record<string, unknown>): FileData {
  const unpivotCols = params.unpivotColumns as string[];
  const nameCol = params.nameColumn as string;
  const valueCol = params.valueColumn as string;
  const extractFields = params.extractFields as Array<{ fieldName: string; valuesBySourceColumn: Record<string, string> }> | undefined;
  const keepCols = data.columns.filter((c) => !unpivotCols.includes(c));
  const result: Record<string, unknown>[] = [];

  for (const row of data.rows) {
    for (const col of unpivotCols) {
      const newRow: Record<string, unknown> = {};
      for (const kc of keepCols) newRow[kc] = row[kc];
      newRow[nameCol] = col;
      newRow[valueCol] = row[col];
      if (extractFields) {
        for (const ef of extractFields) {
          const extracted = ef.valuesBySourceColumn?.[col];
          if (extracted !== undefined) newRow[ef.fieldName] = extracted;
        }
      }
      result.push(newRow);
    }
  }

  const newColumns = [...keepCols, nameCol, valueCol];
  if (extractFields) {
    for (const ef of extractFields) {
      if (!newColumns.includes(ef.fieldName)) newColumns.push(ef.fieldName);
    }
  }
  return { columns: newColumns, rows: result };
}

export function applyExpand(data: FileData, params: Record<string, unknown>): FileData {
  const labelCol = params.labelColumn as string;
  const maxDepth = Math.max(2, Math.min(8, Number(params.maxDepth) || 4));
  const valueCols = data.columns.filter((c) => c !== labelCol);
  const nestingCols = Array.from({ length: maxDepth }, (_, i) => `nesting_level_${i + 1}`);
  const stack: string[] = Array(maxDepth).fill("");
  const result: Record<string, unknown>[] = [];

  for (let i = 0; i < data.rows.length; i++) {
    const row = data.rows[i];
    const rawLabel = String(row[labelCol] ?? "");
    const label = rawLabel.replace(/^\s*[*#\-\u2022]+\s*/, "").replace(/\s+/g, " ").trim();
    if (!label) continue;

    let level = maxDepth;
    const starMatch = rawLabel.match(/^\s*(\*+)\s*/);
    if (starMatch) {
      level = Math.max(1, Math.min(maxDepth, maxDepth - starMatch[1].length + 1));
    } else if (/^\d{3,}/.test(label)) {
      level = maxDepth;
    } else if (/^\s+/.test(rawLabel)) {
      const indent = rawLabel.match(/^\s+/)?.[0]?.length ?? 0;
      level = Math.max(1, Math.min(maxDepth, Math.floor(indent / 2) + 1));
    }

    stack[level - 1] = label;
    for (let d = level; d < maxDepth; d++) stack[d] = "";

    let nextLevel = 0;
    for (let j = i + 1; j < data.rows.length; j++) {
      const nextRaw = String(data.rows[j][labelCol] ?? "");
      const nextLabel = nextRaw.replace(/^\s*[*#\-\u2022]+\s*/, "").trim();
      if (!nextLabel) continue;
      const nextStar = nextRaw.match(/^\s*(\*+)\s*/);
      if (nextStar) {
        nextLevel = Math.max(1, Math.min(maxDepth, maxDepth - nextStar[1].length + 1));
      } else if (/^\d{3,}/.test(nextLabel)) {
        nextLevel = maxDepth;
      } else {
        nextLevel = level;
      }
      break;
    }

    if (nextLevel > level) continue;

    const out: Record<string, unknown> = {};
    for (let d = 0; d < maxDepth; d++) out[nestingCols[d]] = stack[d] ?? "";
    for (const vc of valueCols) out[vc] = row[vc] ?? "";
    result.push(out);
  }

  return { columns: [...nestingCols, ...valueCols], rows: result };
}

export function applyAggregate(data: FileData, params: Record<string, unknown>): FileData {
  const groupByCols = params.groupByColumns as string[];
  const aggregations = params.aggregations as Array<{ column: string; function: string }>;
  const groups = new Map<string, Record<string, unknown>[]>();

  for (const row of data.rows) {
    const key = groupByCols.map((col) => String(row[col] ?? "")).join("|||");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const result: Record<string, unknown>[] = [];
  for (const rows of groups.values()) {
    const out: Record<string, unknown> = {};
    for (const col of groupByCols) out[col] = rows[0][col];
    for (const agg of aggregations) {
      out[agg.column] = aggregateValues(rows.map((r) => r[agg.column]), agg.function);
    }
    for (const col of data.columns) { if (!(col in out)) out[col] = rows[0][col]; }
    result.push(out);
  }
  return { columns: data.columns, rows: result };
}

export function applyMap(data: FileData, params: Record<string, unknown>, targetPaths: string[]): FileData {
  const mappings = params.mappings as Array<{ sourceColumn: string; targetPath: string; defaultValue?: string }>;
  const defaults = (params.defaults ?? []) as Array<{ targetPath: string; value: string }>;

  const colLookup = new Map<string, string>();
  for (const col of data.columns) {
    colLookup.set(col, col);
    colLookup.set(col.trim().toLowerCase(), col);
  }

  const resolvedMappings = mappings.map((m) => {
    const exact = colLookup.get(m.sourceColumn);
    const resolved = exact ?? colLookup.get(m.sourceColumn.trim().toLowerCase());
    return { ...m, resolvedSource: resolved };
  });

  const result: Record<string, unknown>[] = [];
  for (const row of data.rows) {
    const out: Record<string, unknown> = {};
    for (const m of resolvedMappings) {
      if (m.resolvedSource) {
        const val = row[m.resolvedSource];
        out[m.targetPath] = (val != null && String(val).trim() !== "") ? val : (m.defaultValue ?? "");
      } else {
        out[m.targetPath] = m.defaultValue ?? "";
      }
    }
    for (const tp of targetPaths) {
      if (!(tp in out)) {
        const def = defaults.find((d) => d.targetPath === tp);
        out[tp] = def?.value ?? "";
      }
    }
    result.push(out);
  }
  return { columns: targetPaths, rows: result };
}

// ---------------------------------------------------------------------------
// mapRows — row-by-row conditional transformation with lookups
// ---------------------------------------------------------------------------

interface MapRowsCondition {
  column: string;
  operator: "eq" | "neq" | "contains" | "not_contains" | "gt" | "gte" | "lt" | "lte" | "regex" | "is_empty" | "is_not_empty";
  value?: unknown;
}

interface MapRowsRule {
  conditions: MapRowsCondition[];
  conditionLogic?: "and" | "or";
  targetColumn: string;
  value: unknown;
  valueFromColumn?: string;
}

interface MapRowsLookup {
  sourceColumn: string;
  lookupData: Record<string, unknown>;
  targetColumn: string;
  defaultValue?: unknown;
}

function evaluateCondition(row: Record<string, unknown>, cond: MapRowsCondition): boolean {
  const cellVal = row[cond.column];
  const cellStr = String(cellVal ?? "").trim();
  const compareVal = String(cond.value ?? "").trim();

  switch (cond.operator) {
    case "eq": return cellStr.toLowerCase() === compareVal.toLowerCase();
    case "neq": return cellStr.toLowerCase() !== compareVal.toLowerCase();
    case "contains": return cellStr.toLowerCase().includes(compareVal.toLowerCase());
    case "not_contains": return !cellStr.toLowerCase().includes(compareVal.toLowerCase());
    case "gt": return Number(cellStr) > Number(compareVal);
    case "gte": return Number(cellStr) >= Number(compareVal);
    case "lt": return Number(cellStr) < Number(compareVal);
    case "lte": return Number(cellStr) <= Number(compareVal);
    case "regex": {
      try { return new RegExp(compareVal, "i").test(cellStr); } catch { return false; }
    }
    case "is_empty": return cellStr === "";
    case "is_not_empty": return cellStr !== "";
    default: return false;
  }
}

export function applyMapRows(data: FileData, params: Record<string, unknown>): FileData {
  const rules = (params.rules ?? []) as MapRowsRule[];
  const lookups = (params.lookups ?? []) as MapRowsLookup[];
  const newColumns = new Set(data.columns);

  for (const rule of rules) {
    newColumns.add(rule.targetColumn);
  }
  for (const lookup of lookups) {
    newColumns.add(lookup.targetColumn);
  }

  const columns = [...newColumns];
  const rows = data.rows.map((row) => {
    const out = { ...row };

    for (const rule of rules) {
      const results = rule.conditions.map((c) => evaluateCondition(row, c));
      const logic = rule.conditionLogic ?? "and";
      const match = logic === "and" ? results.every(Boolean) : results.some(Boolean);

      if (match) {
        out[rule.targetColumn] = rule.valueFromColumn ? row[rule.valueFromColumn] : rule.value;
      }
    }

    for (const lookup of lookups) {
      const key = String(row[lookup.sourceColumn] ?? "").trim();
      out[lookup.targetColumn] = lookup.lookupData[key] ?? lookup.defaultValue ?? "";
    }

    return out;
  });

  return { columns, rows };
}

// ---------------------------------------------------------------------------
// reduce — aggregate multiple columns into fewer columns by a key
// ---------------------------------------------------------------------------

interface ReduceAggregation {
  sourceColumn: string;
  function: string;
  outputColumn?: string;
}

export function applyReduce(data: FileData, params: Record<string, unknown>): FileData {
  const keyColumns = params.keyColumns as string[];
  const aggregations = (params.aggregations ?? []) as ReduceAggregation[];
  const includeCount = params.includeCount as boolean | undefined;

  const groups = new Map<string, Record<string, unknown>[]>();
  for (const row of data.rows) {
    const key = keyColumns.map((col) => String(row[col] ?? "")).join("|||");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const outputColumns = [...keyColumns];
  for (const agg of aggregations) {
    const outCol = agg.outputColumn ?? `${agg.sourceColumn}_${agg.function}`;
    if (!outputColumns.includes(outCol)) outputColumns.push(outCol);
  }
  if (includeCount && !outputColumns.includes("_count")) {
    outputColumns.push("_count");
  }

  const result: Record<string, unknown>[] = [];
  for (const rows of groups.values()) {
    const out: Record<string, unknown> = {};
    for (const col of keyColumns) out[col] = rows[0][col];

    for (const agg of aggregations) {
      const values = rows.map((r) => r[agg.sourceColumn]);
      const outCol = agg.outputColumn ?? `${agg.sourceColumn}_${agg.function}`;
      out[outCol] = aggregateValues(values, agg.function);
    }

    if (includeCount) out["_count"] = rows.length;
    result.push(out);
  }

  return { columns: outputColumns, rows: result };
}

export function applyBalanceSheet(data: FileData, params: Record<string, unknown>): FileData {
  const labelColumn = (params.labelColumn as string | undefined) && data.columns.includes(params.labelColumn as string)
    ? params.labelColumn as string
    : inferLabelColumn(data.columns, data.rows);
  return applyExpand(data, { ...params, labelColumn });
}

export function applyFilterRows(data: FileData, params: Record<string, unknown>): FileData {
  const column = params.column as string;
  const pattern = params.pattern as string;
  const mode = (params.mode as string) ?? "remove";
  const caseInsensitive = params.caseInsensitive !== false;

  if (!column || !pattern) return data;
  if (!data.columns.includes(column)) return data;

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, caseInsensitive ? "i" : "");
  } catch {
    return data;
  }

  const matches = (row: Record<string, unknown>) => regex.test(String(row[column] ?? ""));

  const rows = mode === "keep"
    ? data.rows.filter(matches)
    : data.rows.filter((row) => !matches(row));

  return { columns: data.columns, rows };
}

export function applyUnstructured(data: FileData, params: Record<string, unknown>): FileData {
  const textColumn = String(params.textColumnName ?? "raw_text").trim() || "raw_text";
  const flattened = data.rows.map((row) => ({
    [textColumn]: data.columns.map((col) => String(row[col] ?? "").trim()).filter(Boolean).join(" | "),
  }));
  return { columns: [textColumn], rows: flattened };
}

// ---------------------------------------------------------------------------
// schemaLookup — apply lookup tables defined in the schema
// ---------------------------------------------------------------------------

interface SchemaLookupTableDef {
  name: string;
  dimensions: string[];
  values: string[];
  rows: Record<string, string>[];
}

interface SchemaLookupMapping {
  lookupTableName: string;
  dimensionMappings: Array<{ sourceColumn: string; dimension: string }>;
  valueMappings: Array<{ valueColumn: string; targetColumn: string }>;
}

export function applySchemaLookup(data: FileData, params: Record<string, unknown>): FileData {
  const lookupTables = (params.lookupTables ?? []) as SchemaLookupTableDef[];
  const mappings = (params.mappings ?? []) as SchemaLookupMapping[];

  if (mappings.length === 0 || lookupTables.length === 0) return data;

  const tableByName = new Map<string, SchemaLookupTableDef>();
  for (const t of lookupTables) tableByName.set(t.name, t);

  const newColumns = new Set(data.columns);
  for (const m of mappings) {
    for (const vm of m.valueMappings) newColumns.add(vm.targetColumn);
  }

  const columns = [...newColumns];
  const rows = data.rows.map((row) => {
    const out = { ...row };

    for (const mapping of mappings) {
      const table = tableByName.get(mapping.lookupTableName);
      if (!table) continue;

      const matchingRow = table.rows.find((lkRow) =>
        mapping.dimensionMappings.every((dm) => {
          const sourceVal = String(row[dm.sourceColumn] ?? "").trim().toLowerCase();
          const dimVal = String(lkRow[dm.dimension] ?? "").trim().toLowerCase();
          return sourceVal === dimVal;
        }),
      );

      if (matchingRow) {
        for (const vm of mapping.valueMappings) {
          out[vm.targetColumn] = matchingRow[vm.valueColumn] ?? "";
        }
      }
    }

    return out;
  });

  return { columns, rows };
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export function executeTransformation(data: FileData, step: TransformationStep, targetPaths: string[]): FileData {
  switch (step.tool) {
    case "filter": return applyFilter(data, step.params);
    case "trimColumns": return applyTrimColumns(data, step.params);
    case "padColumns": return applyPadColumns(data, step.params);
    case "unpivot": return applyUnpivot(data, step.params);
    case "expand": return applyExpand(data, step.params);
    case "aggregate": return applyAggregate(data, step.params);
    case "mapRows": return applyMapRows(data, step.params);
    case "reduce": return applyReduce(data, step.params);
    case "map": return applyMap(data, step.params, targetPaths);
    case "filterRows": return applyFilterRows(data, step.params);
    case "handleBalanceSheet": return applyBalanceSheet(data, step.params);
    case "handleUnstructuredData": return applyUnstructured(data, step.params);
    case "handleStructuredData": return data;
    case "schemaLookup": return applySchemaLookup(data, step.params);
    default: return data;
  }
}

// ---------------------------------------------------------------------------
// Pipeline builder
// ---------------------------------------------------------------------------

export function buildPipeline(toolsUsed: TransformationStep[]): PipelineDescriptor {
  const nodes: PipelineDescriptor["nodes"] = [
    { id: "source", type: "source", label: "Raw Data", data: {} },
  ];
  const edges: PipelineDescriptor["edges"] = [];
  let prevId = "source";

  for (let i = 0; i < toolsUsed.length; i++) {
    const t = toolsUsed[i];
    const nodeId = `${t.tool}_${i}`;
    const nodeType = t.tool as PipelineDescriptor["nodes"][0]["type"];
    nodes.push({
      id: nodeId,
      type: nodeType,
      label: t.tool.charAt(0).toUpperCase() + t.tool.slice(1),
      data: t.params,
    });
    edges.push({ id: `e_${prevId}_${nodeId}`, source: prevId, target: nodeId });
    prevId = nodeId;
  }

  nodes.push({ id: "target", type: "target", label: "Target Schema", data: {} });
  edges.push({ id: `e_${prevId}_target`, source: prevId, target: "target" });
  return { nodes, edges };
}
