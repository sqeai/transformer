import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createConnector, type DataSourceType } from "@/lib/connectors";
import {
  isDefaultBqDataSourceId,
  createDefaultBigQueryConnector,
} from "@/lib/connectors/default-bigquery";
import {
  buildFieldTypeMap,
  coerceForStorage,
  normalizeRowsForStorage,
  normalizeSqlType,
} from "@/lib/dataset-type-normalizer";

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
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase, userId } = auth;
  const { id } = await params;

  const { data: dataset, error: dsError } = await supabase!
    .from("datasets")
    .select("id, name, state, rows, schema_id")
    .eq("id", id)
    .single();

  if (dsError || !dataset) {
    return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
  }

  const ds = dataset as Record<string, unknown>;

  if (ds.state !== "approved") {
    return NextResponse.json(
      { error: "Dataset must be approved before merging" },
      { status: 400 },
    );
  }

  const { data: approvers } = await supabase!
    .from("dataset_approvers")
    .select("status")
    .eq("dataset_id", id);

  if (approvers && approvers.length > 0) {
    const allApproved = approvers.every(
      (a: Record<string, unknown>) => a.status === "approved",
    );
    if (!allApproved) {
      return NextResponse.json(
        { error: "Cannot merge: not all approvers have approved this dataset" },
        { status: 400 },
      );
    }
  }

  const schemaId = ds.schema_id as string;

  const { data: sds } = await supabase!
    .from("schema_data_sources")
    .select("data_source_id, table_schema, table_name")
    .eq("schema_id", schemaId)
    .single();

  if (!sds) {
    return NextResponse.json(
      { error: "Schema has no linked data source" },
      { status: 400 },
    );
  }

  const sdsRec = sds as Record<string, unknown>;
  const rows = Array.isArray(ds.rows)
    ? (ds.rows as Record<string, unknown>[])
    : [];

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "Dataset has no rows to merge" },
      { status: 400 },
    );
  }

  const columns = Object.keys(rows[0]);
  const tableSchema = sdsRec.table_schema as string;
  const tableName = sdsRec.table_name as string;

  const { data: schemaFieldRows, error: schemaFieldError } = await supabase!
    .from("schema_fields")
    .select("path, data_type")
    .eq("schema_id", schemaId);

  if (schemaFieldError) {
    return NextResponse.json(
      { error: schemaFieldError.message },
      { status: 500 },
    );
  }

  const fieldTypeMap = buildFieldTypeMap(
    (schemaFieldRows ?? []) as Array<{ path: string; data_type: string | null }>,
  );
  const normalizedRows = normalizeRowsForStorage(rows, fieldTypeMap);

  const isDefault = await isDefaultBqDataSourceId(
    sdsRec.data_source_id as string,
  );

  const { data: dataSource } = await supabase!
    .from("data_sources")
    .select("type, config")
    .eq("id", sdsRec.data_source_id)
    .single();

  if (!dataSource) {
    return NextResponse.json(
      { error: "Data source not found" },
      { status: 404 },
    );
  }

  const dsType = dataSource.type as DataSourceType;

  try {
    if (dsType === "bigquery") {
      const connector = isDefault
        ? createDefaultBigQueryConnector()
        : createConnector(dsType, dataSource.config as Record<string, unknown>);

      if (!connector) {
        return NextResponse.json(
          { error: "Failed to create BigQuery connector" },
          { status: 500 },
        );
      }

      try {
        const fqn = `\`${tableSchema}.${tableName}\``;

        const existingColumns = await connector.getColumns(tableSchema, tableName);
        const existingColNames = new Set(
          existingColumns.map((c) => c.name.toLowerCase()),
        );

        for (const col of columns) {
          const colName = col.replace(/[^a-zA-Z0-9_]/g, "_");
          if (!existingColNames.has(colName.toLowerCase())) {
            const colType = normalizeSqlType(fieldTypeMap[col]);
            await connector.query(
              `ALTER TABLE ${fqn} ADD COLUMN ${colName} ${colType}`,
            );
          }
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
          const colList = columns
            .map((c) => c.replace(/[^a-zA-Z0-9_]/g, "_"))
            .join(", ");
          const valuesList = batch
            .map(
              (row) =>
                `(${columns
                  .map((c) => {
                    const key = c.replace(/[^a-zA-Z0-9_]/g, "_");
                    const v = row[key];
                    if (v === null || v === undefined) return "NULL";
                    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
                    if (typeof v === "number") return String(v);
                    return `'${String(v).replace(/'/g, "\\'")}'`;
                  })
                  .join(", ")})`,
            )
            .join(", ");

          await connector.query(
            `INSERT INTO ${fqn} (${colList}) VALUES ${valuesList}`,
          );
        }
      } finally {
        await connector.close();
      }
    } else if (dsType === "postgres") {
      const pg = await import("pg");
      const pgConfig = dataSource.config as {
        host: string;
        port: number;
        user: string;
        password: string;
        database: string;
        ssl?: boolean;
      };
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
        const safeSchema = tableSchema.replace(/[^a-zA-Z0-9_]/g, "");
        const safeTable = tableName.replace(/[^a-zA-Z0-9_]/g, "");

        const BATCH_SIZE = 500;
        for (let i = 0; i < normalizedRows.length; i += BATCH_SIZE) {
          const batch = normalizedRows.slice(i, i + BATCH_SIZE);
          const placeholders = batch
            .map(
              (_, rowIdx) =>
                `(${columns
                  .map(
                    (_, colIdx) =>
                      `$${rowIdx * columns.length + colIdx + 1}`,
                  )
                  .join(", ")})`,
            )
            .join(", ");

          const values = batch.flatMap((row) =>
            columns.map((col) =>
              row[col] != null ? String(row[col]) : null,
            ),
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
      return NextResponse.json(
        { error: `Merge to ${dsType} is not supported yet` },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    await admin.from("dataset_logs").insert({
      dataset_id: id,
      user_id: userId!,
      action: "merge",
      from_state: ds.state as string,
      to_state: "completed",
      comment: `Merged ${rows.length} rows into ${tableSchema}.${tableName}`,
      metadata: {
        targetSchema: tableSchema,
        targetTable: tableName,
        rowCount: rows.length,
      },
    });

    await supabase!
      .from("datasets")
      .update({ state: "completed" })
      .eq("id", id);

    return NextResponse.json({
      ok: true,
      merged: rows.length,
      target: `${tableSchema}.${tableName}`,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: `Merge failed: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}
