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
import * as XLSX from "xlsx";

function xlsxCellToString(cell: XLSX.CellObject | undefined): string {
  if (!cell) return "";
  if (cell.w !== undefined) return String(cell.w).trim();
  if (cell.v === undefined || cell.v === null) return "";
  if (cell.v instanceof Date) return cell.v.toISOString();
  return String(cell.v).trim();
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
      const workbook = XLSX.read(buffer, { type: "array", cellStyles: false, cellFormula: false });
      const sheetName = workbook.SheetNames[sheetIndex] ?? workbook.SheetNames[0];
      if (!sheetName) {
        return NextResponse.json({ error: "No worksheet found" }, { status: 400 });
      }

      const sheet = workbook.Sheets[sheetName];
      if (!sheet || !sheet["!ref"]) {
        return NextResponse.json({ error: "Empty worksheet" }, { status: 400 });
      }

      const range = XLSX.utils.decode_range(sheet["!ref"]);
      const totalRows = range.e.r - range.s.r + 1;
      const totalCols = Math.min(range.e.c - range.s.c + 1, 200);

      // Read header row (row 0)
      for (let c = 0; c < totalCols; c++) {
        const cellAddress = XLSX.utils.encode_cell({ r: range.s.r, c: c + range.s.c });
        const cell = sheet[cellAddress] as XLSX.CellObject | undefined;
        const val = xlsxCellToString(cell);
        if (val) headers.push(val);
        else break;
      }

      const colCount = headers.length;
      // Read data rows (starting from row 1)
      for (let r = 1; r < totalRows; r++) {
        const cells: string[] = [];
        for (let c = 0; c < colCount; c++) {
          const cellAddress = XLSX.utils.encode_cell({ r: r + range.s.r, c: c + range.s.c });
          const cell = sheet[cellAddress] as XLSX.CellObject | undefined;
          cells.push(xlsxCellToString(cell));
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
