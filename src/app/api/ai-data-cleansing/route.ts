import { NextRequest, NextResponse } from "next/server";
import { applyDataCleansingPlan, type DataCleansingPlan } from "@/lib/ai-data-cleansing";
import { buildDataCleansingPlanWithLLM } from "@/lib/llm-schema";

const FALLBACK_TOTAL_KEYWORDS = ["total", "subtotal", "grand total", "jumlah", "jumlah total"];

function normalizePlan(plan: Partial<DataCleansingPlan>, columns: string[]): DataCleansingPlan {
  return {
    paddingColumns: Array.isArray(plan.paddingColumns)
      ? plan.paddingColumns.map((value) => String(value)).filter((column) => columns.includes(column))
      : [],
    removeEmptyRows: plan.removeEmptyRows !== false,
    removeTotalRows: plan.removeTotalRows !== false,
    totalRowKeywords: Array.isArray(plan.totalRowKeywords)
      ? plan.totalRowKeywords.map((value) => String(value).trim().toLowerCase()).filter(Boolean)
      : FALLBACK_TOTAL_KEYWORDS,
    flattenHierarchy: plan.flattenHierarchy === true,
    hierarchyMaxDepth:
      typeof plan.hierarchyMaxDepth === "number" && Number.isFinite(plan.hierarchyMaxDepth)
        ? Math.max(2, Math.min(8, Math.floor(plan.hierarchyMaxDepth)))
        : undefined,
    hierarchyLabelColumn:
      typeof plan.hierarchyLabelColumn === "string" && columns.includes(plan.hierarchyLabelColumn)
        ? plan.hierarchyLabelColumn
        : undefined,
    hierarchyValueColumn:
      typeof plan.hierarchyValueColumn === "string" && columns.includes(plan.hierarchyValueColumn)
        ? plan.hierarchyValueColumn
        : undefined,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      columns?: unknown;
      rows?: unknown;
      sheetName?: unknown;
    };
    const columns = Array.isArray(body.columns) ? body.columns.map((value) => String(value)) : [];
    const rows = Array.isArray(body.rows) ? body.rows : [];

    if (columns.length === 0 || rows.length === 0) {
      return NextResponse.json(
        { error: "columns and rows are required" },
        { status: 400 },
      );
    }

    const normalizedRows: Record<string, unknown>[] = rows
      .filter((row): row is Record<string, unknown> => row != null && typeof row === "object")
      .map((row) => {
        const normalized: Record<string, unknown> = {};
        for (const column of columns) {
          normalized[column] = row[column];
        }
        return normalized;
      });

    let plan: DataCleansingPlan;
    try {
      plan = await buildDataCleansingPlanWithLLM(columns, normalizedRows);
    } catch {
      plan = normalizePlan(
        {
          paddingColumns: columns.length > 0 ? [columns[0]] : [],
          removeEmptyRows: true,
          removeTotalRows: true,
          totalRowKeywords: FALLBACK_TOTAL_KEYWORDS,
          flattenHierarchy: false,
        },
        columns,
      );
    }

    const result = applyDataCleansingPlan(normalizedRows, columns, plan);
    return NextResponse.json({
      plan,
      cleanedColumns: result.cleanedColumns,
      cleanedRows: result.cleanedRows,
      addedCells: result.addedCells,
      removedRows: result.removedRows,
    });
  } catch (error) {
    console.error("ai-data-cleansing failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AI data cleansing failed" },
      { status: 500 },
    );
  }
}
