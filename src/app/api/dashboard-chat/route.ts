import { NextRequest, NextResponse } from "next/server";
import { getDashboardAgent } from "@/lib/agents/dashboard-agent";
import type { DataSourceContext } from "@/lib/agents/analyst-agent/tools";
import { createClient } from "@/lib/supabase/server";
import { createConnector } from "@/lib/connectors";
import type { DataSourceType } from "@/lib/connectors";
import { type BaseMessage } from "@langchain/core/messages";
import { toUIMessageStream, toBaseMessages } from "@ai-sdk/langchain";
import { createUIMessageStreamResponse, type UIMessage } from "ai";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (!user || userError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const selectedDataSourceIds: string[] = body.dataSourceIds ?? [];
    const dataSourceContexts: DataSourceContext[] =
      body.dataSourceContexts ?? [];
    const currentPanels: string = body.currentPanels ?? "[]";

    const filteredMessages = (body.messages ?? []).filter(
      (message: Record<string, unknown>) =>
        message.role === "user" || message.role === "assistant",
    );

    const rawMessages: UIMessage[] = filteredMessages.map(
      (msg: Record<string, unknown>) => {
        if (msg.parts && Array.isArray(msg.parts)) {
          const textParts = (msg.parts as Record<string, unknown>[]).filter(
            (part) => part.type === "text",
          );
          return { ...msg, parts: textParts };
        }
        return {
          ...msg,
          parts: msg.content
            ? [
                {
                  type: "text",
                  text:
                    typeof msg.content === "string"
                      ? msg.content
                      : JSON.stringify(msg.content),
                },
              ]
            : [],
        };
      },
    );

    const messages: BaseMessage[] = await toBaseMessages(rawMessages);

    const agent = getDashboardAgent();
    if (!agent) {
      return NextResponse.json(
        { error: "Agent not available. Please ensure ANTHROPIC_API_KEY is set." },
        { status: 500 },
      );
    }

    const queryFn = async (
      dataSourceId: string,
      sql: string,
    ): Promise<{
      rows: Record<string, unknown>[];
      rowCount: number;
      error?: string;
    }> => {
      const { data, error } = await supabase
        .from("data_sources")
        .select("type, config")
        .eq("id", dataSourceId)
        .single();

      if (error || !data) {
        return { rows: [], rowCount: 0, error: "Data source not found" };
      }

      if (!selectedDataSourceIds.includes(dataSourceId)) {
        return {
          rows: [],
          rowCount: 0,
          error: "This data source is not selected",
        };
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

    const eventStream = await agent.streamEvents(
      {
        messages,
        dataSources: dataSourceContexts,
        currentPanels,
        queryFn,
      },
      { version: "v2", recursionLimit: 50 },
    );

    return createUIMessageStreamResponse({
      stream: toUIMessageStream(eventStream),
    });
  } catch (e: unknown) {
    const error = e as Error & { status?: number };
    return NextResponse.json(
      { error: error.message },
      { status: error.status ?? 500 },
    );
  }
}
