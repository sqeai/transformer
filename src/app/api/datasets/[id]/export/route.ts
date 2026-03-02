import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createConnector, type DataSourceType } from "@/lib/connectors";

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

  const { data: dataSource, error: srcError } = await supabase!
    .from("data_sources")
    .select("id, type, config")
    .eq("id", dataSourceId)
    .single();

  if (srcError || !dataSource) {
    return NextResponse.json({ error: "Data source not found" }, { status: 404 });
  }

  const src = dataSource as Record<string, unknown>;
  const dsType = src.type as DataSourceType;
  const dsConfig = src.config as Record<string, unknown>;
  const rows = Array.isArray(ds.rows) ? (ds.rows as Record<string, unknown>[]) : [];

  if (rows.length === 0) {
    return NextResponse.json({ error: "Dataset has no rows to export" }, { status: 400 });
  }

  const columns = Object.keys(rows[0]);
  const schemaName = targetSchema || "public";

  try {
    if (dsType === "bigquery") {
      const { BigQuery } = await import("@google-cloud/bigquery");
      const bqConfig = dsConfig as { projectId: string; credentials?: Record<string, unknown>; keyFilename?: string };
      const client = new BigQuery({
        projectId: bqConfig.projectId,
        ...(bqConfig.credentials ? { credentials: bqConfig.credentials } : {}),
        ...(bqConfig.keyFilename ? { keyFilename: bqConfig.keyFilename } : {}),
      });

      const datasetRef = client.dataset(schemaName);
      const [datasetExists] = await datasetRef.exists();
      if (!datasetExists) {
        await client.createDataset(schemaName);
      }

      const tableRef = datasetRef.table(targetTable);
      const [tableExists] = await tableRef.exists();

      if (!tableExists && createTable) {
        const schema = columns.map((col) => ({
          name: col.replace(/[^a-zA-Z0-9_]/g, "_"),
          type: "STRING",
          mode: "NULLABLE" as const,
        }));
        await datasetRef.createTable(targetTable, { schema });
      }

      const sanitizedRows = rows.map((row) => {
        const clean: Record<string, unknown> = {};
        for (const col of columns) {
          clean[col.replace(/[^a-zA-Z0-9_]/g, "_")] = row[col] != null ? String(row[col]) : null;
        }
        return clean;
      });

      const BATCH_SIZE = 500;
      for (let i = 0; i < sanitizedRows.length; i += BATCH_SIZE) {
        const batch = sanitizedRows.slice(i, i + BATCH_SIZE);
        await datasetRef.table(targetTable).insert(batch);
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
          const batch = rows.slice(i, i + BATCH_SIZE);
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
    await admin
      .from("datasets")
      .update({ state: "completed" })
      .eq("id", id);

    await admin.from("dataset_logs").insert({
      dataset_id: id,
      user_id: userId!,
      action: "export",
      from_state: ds.state as string,
      to_state: "completed",
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
