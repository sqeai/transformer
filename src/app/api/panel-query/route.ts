import { NextRequest, NextResponse } from "next/server";
import { getPanelQueryAgent } from "@/lib/agents/panel-query-agent";
import type { DataSourceContext } from "@/lib/agents/analyst-agent/tools";
import type { DimensionsLookupFn } from "@/lib/agents/analyst-agent";
import { requireAuth } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createConnector } from "@/lib/connectors";
import type { DataSourceType } from "@/lib/connectors";

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.error;

    const supabase = createAdminClient();
    const body = await req.json();

    const prompt: string = body.prompt;
    const dataSourceContexts: DataSourceContext[] = body.dataSourceContexts ?? [];

    if (!prompt?.trim()) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    if (dataSourceContexts.length === 0) {
      return NextResponse.json({ error: "No data sources provided" }, { status: 400 });
    }

    const agent = getPanelQueryAgent();
    if (!agent) {
      return NextResponse.json(
        { error: "Agent not available. Please ensure ANTHROPIC_API_KEY is set." },
        { status: 500 },
      );
    }

    const dataSourceIds = dataSourceContexts.map((ds) => ds.id);

    const queryFn = async (
      dataSourceId: string,
      sql: string,
    ): Promise<{ rows: Record<string, unknown>[]; rowCount: number; error?: string }> => {
      const { data, error } = await supabase
        .from("data_sources")
        .select("type, config")
        .eq("id", dataSourceId)
        .single();

      if (error || !data) {
        return { rows: [], rowCount: 0, error: "Data source not found" };
      }

      if (!dataSourceIds.includes(dataSourceId)) {
        return { rows: [], rowCount: 0, error: "This data source is not selected" };
      }

      const connector = createConnector(
        data.type as DataSourceType,
        data.config as Record<string, unknown>,
      );

      try {
        const rows = await connector.query(sql);
        return { rows, rowCount: rows.length };
      } catch (err: unknown) {
        return { rows: [], rowCount: 0, error: (err as Error).message };
      } finally {
        await connector.close();
      }
    };

    const dimensionsLookupFn: DimensionsLookupFn = async (dataSourceId, schema, table) => {
      const { data, error } = await supabase
        .from("table_dimensions")
        .select("dimensions")
        .eq("data_source_id", dataSourceId)
        .eq("schema_name", schema)
        .eq("table_name", table)
        .single();

      if (error || !data) {
        return { dimensions: null, error: "No dimensions found." };
      }
      return {
        dimensions: data.dimensions as Record<string, { type: string; uniqueValues?: string[]; sampleValues?: string[]; nullPercentage?: number }>,
      };
    };

    const result = await agent.translate({
      prompt,
      dataSources: dataSourceContexts,
      queryFn,
      dimensionsLookupFn,
    });

    return NextResponse.json(result);
  } catch (e: unknown) {
    const error = e as Error & { status?: number };
    return NextResponse.json(
      { error: error.message },
      { status: error.status ?? 500 },
    );
  }
}
