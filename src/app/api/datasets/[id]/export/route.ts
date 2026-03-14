import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createConnector, type DataSourceType } from "@/lib/connectors";
import {
  buildFieldTypeMap,
  coerceForStorage,
  normalizeRowsForStorage,
  normalizeSqlType,
} from "@/lib/dataset-type-normalizer";
import {
  DEFAULT_BIGQUERY_ID,
  isDefaultBigQueryConfigured,
  getDefaultBigQueryConfig,
  getDefaultBigQuerySchemaName,
} from "@/lib/connectors/default-bigquery";

type BigQueryConfigShape = {
  projectId?: string;
  credentials?: Record<string, unknown>;
  service_account?: Record<string, unknown> | string;
  keyFilename?: string;
};

function parseServiceAccount(
  value: BigQueryConfigShape["service_account"]
): Record<string, unknown> | undefined {
  if (!value) return undefined;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return undefined;
    }
    return undefined;
  }
  if (typeof value === "object") return value;
  return undefined;
}

function formatBigQueryError(err: unknown, context: Record<string, unknown>) {
  const e = err as {
    message?: string;
    code?: number | string;
    errors?: Array<{ message?: string; reason?: string; location?: string }>;
    response?: { status?: number; statusText?: string; data?: unknown };
  };
  return {
    message: e?.message ?? "Unknown BigQuery error",
    code: e?.code,
    errors: e?.errors ?? [],
    httpStatus: e?.response?.status,
    httpStatusText: e?.response?.statusText,
    responseData: e?.response?.data,
    context,
  };
}

function coerceBigQueryWholeNumber(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  const normalized = String(value).replace(/,/g, "").trim();
  if (!normalized) return null;
  if (!/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(normalized)) return null;

  const sign = normalized.startsWith("-") ? "-" : "";
  const unsigned = normalized.replace(/^[-+]/, "");
  const integerPart = unsigned.split(".")[0] || "0";
  const collapsed = integerPart.replace(/^0+(?=\d)/, "");
  return `${sign}${collapsed || "0"}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase, userId } = auth;
  const { id } = await params;

  let body: {
    dataSourceId?: string;
    targetSchema?: string;
    targetTable?: string;
    createTable?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { dataSourceId, targetSchema, targetTable, createTable } = body;
  if (!dataSourceId || !targetTable) {
    return NextResponse.json({ error: "dataSourceId and targetTable are required" }, { status: 400 });
  }

  const { data: dataset, error: dsError } = await supabase!
    .from("datasets")
    .select("id, name, state, rows, schema_id")
    .eq("id", id)
    .single();

  if (dsError || !dataset) {
    return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
  }

  const ds = dataset as Record<string, unknown>;

  const { data: approvers } = await supabase!
    .from("dataset_approvers")
    .select("status")
    .eq("dataset_id", id);

  if (approvers && approvers.length > 0) {
    const allApproved = approvers.every((a: Record<string, unknown>) => a.status === "approved");
    if (!allApproved) {
      return NextResponse.json({
        error: "Cannot export: not all approvers have approved this dataset",
      }, { status: 400 });
    }
  }

  let dsType: DataSourceType;
  let dsConfig: Record<string, unknown>;

  if (dataSourceId === DEFAULT_BIGQUERY_ID) {
    if (!isDefaultBigQueryConfigured()) {
      return NextResponse.json({ error: "Default BigQuery is not configured" }, { status: 404 });
    }
    dsType = "bigquery";
    dsConfig = getDefaultBigQueryConfig() as unknown as Record<string, unknown>;
  } else {
    const { data: dataSource, error: srcError } = await supabase!
      .from("data_sources")
      .select("id, type, config")
      .eq("id", dataSourceId)
      .single();

    if (srcError || !dataSource) {
      return NextResponse.json({ error: "Data source not found" }, { status: 404 });
    }

    const src = dataSource as Record<string, unknown>;
    dsType = src.type as DataSourceType;
    dsConfig = src.config as Record<string, unknown>;
  }

  const rows = Array.isArray(ds.rows) ? (ds.rows as Record<string, unknown>[]) : [];

  if (rows.length === 0) {
    return NextResponse.json({ error: "Dataset has no rows to export" }, { status: 400 });
  }

  const columns = Object.keys(rows[0]);
  const schemaName = targetSchema || (dataSourceId === DEFAULT_BIGQUERY_ID ? getDefaultBigQuerySchemaName() : "public");
  const { data: schemaFieldRows, error: schemaFieldError } = await supabase!
    .from("schema_fields")
    .select("path, data_type")
    .eq("schema_id", ds.schema_id as string);
  if (schemaFieldError) {
    return NextResponse.json({ error: schemaFieldError.message }, { status: 500 });
  }
  const fieldTypeMap = buildFieldTypeMap(
    ((schemaFieldRows ?? []) as Array<{ path: string; data_type: string | null }>)
  );
  const normalizedRows = normalizeRowsForStorage(rows, fieldTypeMap);

  try {
    if (dsType === "bigquery") {
      const { BigQuery } = await import("@google-cloud/bigquery");
      const bqConfig = dsConfig as BigQueryConfigShape;
      const serviceAccount = parseServiceAccount(bqConfig.service_account);
      const credentials = bqConfig.credentials ?? serviceAccount;
      if (!bqConfig.projectId) {
        return NextResponse.json({ error: "BigQuery config missing projectId" }, { status: 400 });
      }

      const client = new BigQuery({
        projectId: bqConfig.projectId,
        ...(credentials ? { credentials } : {}),
        ...(bqConfig.keyFilename ? { keyFilename: bqConfig.keyFilename } : {}),
      });

      const bqDatasetName = schemaName;
      const bqTableName = targetTable;
      const datasetRef = client.dataset(bqDatasetName);

      let datasetExists = false;
      try {
        [datasetExists] = await datasetRef.exists();
      } catch (err) {
        const detail = formatBigQueryError(err, {
          step: "check_dataset_exists",
          projectId: bqConfig.projectId,
          dataset: bqDatasetName,
          table: bqTableName,
        });
        return NextResponse.json(
          { error: `BigQuery export failed at check_dataset_exists: ${detail.message}`, details: detail },
          { status: 500 }
        );
      }

      if (!datasetExists) {
        try {
          await client.createDataset(bqDatasetName);
        } catch (err) {
          const detail = formatBigQueryError(err, {
            step: "create_dataset",
            projectId: bqConfig.projectId,
            dataset: bqDatasetName,
            table: bqTableName,
          });
          return NextResponse.json(
            { error: `BigQuery export failed at create_dataset: ${detail.message}`, details: detail },
            { status: 500 }
          );
        }
      }

      const tableRef = datasetRef.table(bqTableName);
      let tableExists = false;
      try {
        [tableExists] = await tableRef.exists();
      } catch (err) {
        const detail = formatBigQueryError(err, {
          step: "check_table_exists",
          projectId: bqConfig.projectId,
          dataset: bqDatasetName,
          table: bqTableName,
        });
        return NextResponse.json(
          { error: `BigQuery export failed at check_table_exists: ${detail.message}`, details: detail },
          { status: 500 }
        );
      }

      if (!tableExists && createTable) {
        const schema = columns.map((col) => ({
          name: col.replace(/[^a-zA-Z0-9_]/g, "_"),
          type: normalizeSqlType(fieldTypeMap[col]),
          mode: "NULLABLE" as const,
        }));
        try {
          await datasetRef.createTable(bqTableName, { schema });
        } catch (err) {
          const detail = formatBigQueryError(err, {
            step: "create_table",
            projectId: bqConfig.projectId,
            dataset: bqDatasetName,
            table: bqTableName,
            columnCount: schema.length,
          });
          return NextResponse.json(
            { error: `BigQuery export failed at create_table: ${detail.message}`, details: detail },
            { status: 500 }
          );
        }
      } else if (!tableExists && !createTable) {
        return NextResponse.json({
          error: `BigQuery table not found: ${bqDatasetName}.${bqTableName}. Enable create table to create it automatically.`,
        }, { status: 400 });
      }

      const sanitizedRows = normalizedRows.map((row) => {
        const clean: Record<string, unknown> = {};
        for (const col of columns) {
          const type = fieldTypeMap[col] ?? "STRING";
          let value = coerceForStorage(row[col], type);
          if (type === "NUMERIC" || type === "INTEGER") {
            value = coerceBigQueryWholeNumber(value);
          }
          clean[col.replace(/[^a-zA-Z0-9_]/g, "_")] = value;
        }
        return clean;
      });

      const BATCH_SIZE = 500;
      for (let i = 0; i < sanitizedRows.length; i += BATCH_SIZE) {
        const batch = sanitizedRows.slice(i, i + BATCH_SIZE);
        try {
          await datasetRef.table(bqTableName).insert(batch);
        } catch (err) {
          const detail = formatBigQueryError(err, {
            step: "insert_rows",
            projectId: bqConfig.projectId,
            dataset: bqDatasetName,
            table: bqTableName,
            batchStart: i,
            batchEnd: Math.min(i + BATCH_SIZE, sanitizedRows.length) - 1,
            batchSize: batch.length,
            totalRows: sanitizedRows.length,
          });
          return NextResponse.json(
            { error: `BigQuery export failed at insert_rows: ${detail.message}`, details: detail },
            { status: 500 }
          );
        }
      }
    } else if (dsType === "postgres") {
      const pg = await import("pg");
      const pgConfig = dsConfig as { host: string; port: number; user: string; password: string; database: string; ssl?: boolean };
      const client = new pg.default.Client({
        host: pgConfig.host,
        port: pgConfig.port,
        user: pgConfig.user,
        password: pgConfig.password,
        database: pgConfig.database,
        ssl: pgConfig.ssl ? { rejectUnauthorized: false } : undefined,
      });

      await client.connect();
      try {
        const safeCols = columns.map((c) => `"${c.replace(/"/g, '""')}"`);
        const safeSchema = schemaName.replace(/[^a-zA-Z0-9_]/g, "");
        const safeTable = targetTable.replace(/[^a-zA-Z0-9_]/g, "");

        if (createTable) {
          const colDefs = columns.map((c) => `"${c.replace(/"/g, '""')}" TEXT`).join(", ");
          await client.query(`CREATE TABLE IF NOT EXISTS "${safeSchema}"."${safeTable}" (${colDefs})`);
        }

        const BATCH_SIZE = 500;
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
          const batch = normalizedRows.slice(i, i + BATCH_SIZE);
          const placeholders = batch.map((_, rowIdx) =>
            `(${columns.map((_, colIdx) => `$${rowIdx * columns.length + colIdx + 1}`).join(", ")})`
          ).join(", ");

          const values = batch.flatMap((row) =>
            columns.map((col) => row[col] != null ? String(row[col]) : null)
          );

          await client.query(
            `INSERT INTO "${safeSchema}"."${safeTable}" (${safeCols.join(", ")}) VALUES ${placeholders}`,
            values,
          );
        }
      } finally {
        await client.end();
      }
    } else {
      return NextResponse.json({ error: `Export to ${dsType} is not supported yet` }, { status: 400 });
    }

    const admin = createAdminClient();
    await admin.from("dataset_logs").insert({
      dataset_id: id,
      user_id: userId!,
      action: "export",
      from_state: ds.state as string,
      to_state: ds.state as string,
      comment: `Exported to ${dsType}: ${schemaName}.${targetTable}`,
      metadata: { dataSourceId, targetSchema: schemaName, targetTable, dsType, rowCount: rows.length },
    });

    return NextResponse.json({
      ok: true,
      exported: rows.length,
      target: `${schemaName}.${targetTable}`,
    });
  } catch (err: unknown) {
    return NextResponse.json({
      error: `Export failed: ${(err as Error).message}`,
    }, { status: 500 });
  }
}
