import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAuth } from "@/lib/api-auth";
import {
  getDefaultBigQueryConfig,
  getDefaultSchemaPrefix,
  isDefaultBigQueryAvailable,
  ensureDefaultBqDataSource,
} from "@/lib/connectors/default-bigquery";
import { BigQuery } from "@google-cloud/bigquery";
import ExcelJS from "exceljs";

function cellToString(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("richText" in value) {
      return (value as ExcelJS.CellRichTextValue).richText.map((s) => s.text).join("").trim();
    }
    if ("text" in value) return String((value as { text: string }).text).trim();
    if ("result" in value) {
      const r = (value as { result: unknown }).result;
      return r != null ? String(r).trim() : "";
    }
  }
  return String(value).trim();
}

function toSnakeCase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase, userId } = auth;
  const { id: schemaId } = await params;

  const { data: schema } = await supabase!
    .from("schemas")
    .select("id, user_id")
    .eq("id", schemaId)
    .single();
  if (!schema) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = schema.user_id === userId;
  const { data: grantRow } = await supabase!
    .from("schema_grants")
    .select("schema_id")
    .eq("schema_id", schemaId)
    .eq("granted_to_user_id", userId!)
    .maybeSingle();
  if (!isOwner && !grantRow) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isDefaultBigQueryAvailable()) {
    return NextResponse.json({ error: "Default BigQuery is not configured" }, { status: 400 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const contextName = formData.get("contextName") as string | null;
  const sheetIndex = parseInt(formData.get("sheetIndex") as string || "0", 10);

  if (!file) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (!contextName?.trim()) {
    return NextResponse.json({ error: "contextName is required" }, { status: 400 });
  }

  try {
    const buffer = await file.arrayBuffer();
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

    let headers: string[] = [];
    let dataRows: string[][] = [];

    if (ext === "csv") {
      const text = new TextDecoder().decode(buffer);
      const lines = text.split("\n").map((l) => l.split(",").map((c) => c.trim())).filter((r) => r.some((c) => c.length > 0));
      headers = lines[0] ?? [];
      dataRows = lines.slice(1);
    } else if (ext === "xlsx" || ext === "xls") {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const sheet = workbook.worksheets[sheetIndex] ?? workbook.worksheets[0];
      if (!sheet) {
        return NextResponse.json({ error: "No worksheet found" }, { status: 400 });
      }

      const totalRows = sheet.rowCount;
      const totalCols = Math.min(sheet.columnCount, 200);

      const headerRow = sheet.getRow(1);
      for (let c = 1; c <= totalCols; c++) {
        const val = cellToString(headerRow.getCell(c).value);
        if (val) headers.push(val);
        else break;
      }

      const colCount = headers.length;
      for (let r = 2; r <= totalRows; r++) {
        const row = sheet.getRow(r);
        const cells: string[] = [];
        for (let c = 1; c <= colCount; c++) {
          cells.push(cellToString(row.getCell(c).value));
        }
        if (cells.some((c) => c.length > 0)) {
          dataRows.push(cells);
        }
      }
    } else {
      return NextResponse.json({ error: "Unsupported file type. Use CSV or Excel." }, { status: 400 });
    }

    if (headers.length === 0) {
      return NextResponse.json({ error: "No headers found in file" }, { status: 400 });
    }

    const prefix = getDefaultSchemaPrefix();
    const datasetName = `${prefix}_contexts`;
    const tableName = randomUUID().replace(/-/g, "_");

    const config = getDefaultBigQueryConfig()!;
    let credentials = config.credentials as Record<string, unknown> | undefined;
    if (credentials && !credentials.client_email && credentials.credentials && typeof credentials.credentials === "object") {
      credentials = credentials.credentials as Record<string, unknown>;
    }

    const bq = new BigQuery({
      projectId: config.projectId,
      ...(credentials ? { credentials } : {}),
    });

    const dataset = bq.dataset(datasetName);
    const [datasetExists] = await dataset.exists();
    if (!datasetExists) {
      await bq.createDataset(datasetName);
    }

    const bqFields = headers.map((h) => ({
      name: toSnakeCase(h) || `col_${headers.indexOf(h)}`,
      type: "STRING" as const,
      mode: "NULLABLE" as const,
    }));

    const table = dataset.table(tableName);
    const [tableExists] = await table.exists();
    if (tableExists) {
      await table.delete();
    }

    await dataset.createTable(tableName, {
      schema: { fields: bqFields },
    });

    if (dataRows.length > 0) {
      const bqRows = dataRows.map((row) => {
        const obj: Record<string, string> = {};
        bqFields.forEach((field, i) => {
          obj[field.name] = row[i] ?? "";
        });
        return obj;
      });

      const BATCH_SIZE = 500;
      for (let i = 0; i < bqRows.length; i += BATCH_SIZE) {
        const batch = bqRows.slice(i, i + BATCH_SIZE);
        await dataset.table(tableName).insert(batch);
      }
    }

    const dataSourceId = await ensureDefaultBqDataSource(userId!);

    return NextResponse.json({
      success: true,
      dataSourceId,
      bqProject: config.projectId,
      bqDataset: datasetName,
      bqTable: tableName,
      rowCount: dataRows.length,
      columns: bqFields.map((f) => f.name),
    });
  } catch (err) {
    console.error("Upload lookup table error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to upload table" },
      { status: 500 },
    );
  }
}
