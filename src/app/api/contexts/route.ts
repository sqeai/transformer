import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PermissionsService } from "@/lib/permissions";

/**
 * GET /api/contexts?folderIds=id1,id2
 * Returns folder contexts with their related tables, columns, and dimensions.
 * If folderIds is omitted, returns all accessible folder contexts.
 */
export async function GET(request: NextRequest) {
  const result = await requireAuth();
  if (result.error) return result.error;

  const supabase = createAdminClient();
  const userId = result.user.id;

  const folderIdsParam = request.nextUrl.searchParams.get("folderIds");
  let folderIds: string[];

  if (folderIdsParam) {
    folderIds = folderIdsParam.split(",").filter(Boolean);
  } else {
    folderIds = await PermissionsService.getAccessibleFolderIds(userId);
  }

  if (folderIds.length === 0) {
    return NextResponse.json({ contexts: [] });
  }

  const { data: folders } = await supabase
    .from("folders")
    .select("id, name")
    .in("id", folderIds);

  const folderMap = new Map((folders ?? []).map((f) => [f.id, f.name]));

  const { data: contexts } = await supabase
    .from("folder_contexts")
    .select("id, folder_id, content")
    .in("folder_id", folderIds);

  if (!contexts || contexts.length === 0) {
    return NextResponse.json({ contexts: [] });
  }

  const contextIds = contexts.map((c) => c.id);
  const { data: contextTables } = await supabase
    .from("folder_context_tables")
    .select("id, folder_context_id, data_source_id, schema_name, table_name")
    .in("folder_context_id", contextIds);

  const dsIds = [
    ...new Set((contextTables ?? []).map((t) => t.data_source_id)),
  ];

  let dsMap = new Map<string, { name: string; type: string }>();
  if (dsIds.length > 0) {
    const { data: dsSources } = await supabase
      .from("data_sources")
      .select("id, name, type")
      .in("id", dsIds);
    dsMap = new Map(
      (dsSources ?? []).map((d) => [d.id, { name: d.name, type: d.type }]),
    );
  }

  const tableKeys = (contextTables ?? []).map((t) => ({
    data_source_id: t.data_source_id,
    schema_name: t.schema_name,
    table_name: t.table_name,
  }));

  let dimensionsMap = new Map<
    string,
    Record<
      string,
      {
        type: string;
        uniqueValues?: string[];
        sampleValues?: string[];
        nullPercentage?: number;
      }
    >
  >();

  if (tableKeys.length > 0) {
    const { data: dims } = await supabase
      .from("table_dimensions")
      .select("data_source_id, schema_name, table_name, dimensions")
      .in(
        "data_source_id",
        tableKeys.map((t) => t.data_source_id),
      );

    if (dims) {
      for (const d of dims) {
        const key = `${d.data_source_id}:${d.schema_name}.${d.table_name}`;
        dimensionsMap.set(
          key,
          d.dimensions as Record<
            string,
            {
              type: string;
              uniqueValues?: string[];
              sampleValues?: string[];
              nullPercentage?: number;
            }
          >,
        );
      }
    }
  }

  const result2 = contexts.map((ctx) => {
    const tables = (contextTables ?? [])
      .filter((t) => t.folder_context_id === ctx.id)
      .map((t) => {
        const dimKey = `${t.data_source_id}:${t.schema_name}.${t.table_name}`;
        const dimensions = dimensionsMap.get(dimKey) ?? null;
        const ds = dsMap.get(t.data_source_id);

        const columns: { name: string; type: string }[] = [];
        if (dimensions) {
          for (const [colName, colInfo] of Object.entries(dimensions)) {
            columns.push({ name: colName, type: colInfo.type });
          }
        }

        return {
          dataSourceId: t.data_source_id,
          dataSourceName: ds?.name ?? "",
          dataSourceType: ds?.type ?? "",
          schemaName: t.schema_name,
          tableName: t.table_name,
          columns,
          dimensions,
        };
      });

    return {
      folderId: ctx.folder_id,
      folderName: folderMap.get(ctx.folder_id) ?? "",
      content: ctx.content,
      tables,
    };
  });

  return NextResponse.json({ contexts: result2 });
}
