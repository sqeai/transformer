import { NextRequest, NextResponse } from "next/server";
import { requireFolderAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Returns all tables linked to schemas in this folder via schema_data_sources.
 * Grouped by data source, useful for populating the context table picker.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: folderId } = await params;
  const access = await requireFolderAccess(folderId, "view_data_sources");
  if (access.error) return access.error;

  const supabase = createAdminClient();

  // Get all schemas in this folder
  const { data: schemas } = await supabase
    .from("schemas")
    .select("id")
    .eq("folder_id", folderId);

  if (!schemas || schemas.length === 0) {
    return NextResponse.json({ tables: [] });
  }

  const schemaIds = schemas.map((s) => s.id);

  // Get all schema_data_sources for these schemas
  const { data: sds } = await supabase
    .from("schema_data_sources")
    .select("data_source_id, table_schema, table_name")
    .in("schema_id", schemaIds);

  if (!sds || sds.length === 0) {
    return NextResponse.json({ tables: [] });
  }

  // Deduplicate and group by data source
  const seen = new Set<string>();
  const tables: { dataSourceId: string; schema: string; name: string }[] = [];

  for (const row of sds) {
    const key = `${row.data_source_id}::${row.table_schema}::${row.table_name}`;
    if (!seen.has(key)) {
      seen.add(key);
      tables.push({
        dataSourceId: row.data_source_id,
        schema: row.table_schema,
        name: row.table_name,
      });
    }
  }

  return NextResponse.json({ tables });
}
