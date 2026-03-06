import { NextRequest, NextResponse } from "next/server";
import { getAnalystAgent } from "@/lib/agents/analyst-agent";
import type { DataSourceContext, Persona, DimensionsLookupFn } from "@/lib/agents/analyst-agent";
import { requireAuth } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createConnector } from "@/lib/connectors";
import type { DataSourceType } from "@/lib/connectors";
import { type BaseMessage } from "@langchain/core/messages";
import { toUIMessageStream, toBaseMessages } from "@ai-sdk/langchain";
import { createUIMessageStreamResponse, type UIMessage } from "ai";
import { resolveAttachments, type ChatAttachment } from "@/lib/chat-attachments";

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.error;

    const supabase = createAdminClient();

    const body = await req.json();
    const selectedDataSourceIds: string[] = body.dataSourceIds ?? [];
    const dataSourceContexts: DataSourceContext[] =
      body.dataSourceContexts ?? [];
    const attachments: ChatAttachment[] = Array.isArray(body.attachments) ? body.attachments : [];
    const persona: Persona | null = body.persona ?? null;
    const chatId: string | null = body.chatId ?? null;
    const companyContext: string = body.companyContext ?? "";

    let attachmentContext = "";
    if (attachments.length > 0) {
      attachmentContext = await resolveAttachments(attachments);
    }

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

    if (attachmentContext && messages.length > 0) {
      const last = messages[messages.length - 1];
      if (last._getType() === "human" && typeof last.content === "string") {
        last.content = attachmentContext + last.content;
      }
    }

    const agent = getAnalystAgent();
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

    const dimensionsLookupFn: DimensionsLookupFn = async (dataSourceId, schema, table) => {
      const { data, error } = await supabase
        .from("table_dimensions")
        .select("dimensions")
        .eq("data_source_id", dataSourceId)
        .eq("schema_name", schema)
        .eq("table_name", table)
        .single();

      if (error || !data) {
        return { dimensions: null, error: "No dimensions found. Try refreshing dimensions for this table." };
      }
      return { dimensions: data.dimensions as Record<string, { type: string; uniqueValues?: string[]; sampleValues?: string[]; nullPercentage?: number }> };
    };

    const eventStream = await agent.streamEvents(
      {
        messages,
        dataSources: dataSourceContexts,
        queryFn,
        persona,
        dimensionsLookupFn,
        companyContext,
      },
      { version: "v2", recursionLimit: 50 },
    );

    // Save chat history asynchronously
    if (chatId) {
      const allMessages = body.messages ?? [];
      supabase
        .from("chat_history")
        .upsert({
          id: chatId,
          user_id: authResult.user.id,
          agent_type: "analyst",
          title: allMessages[0]?.content?.slice(0, 100) || "Untitled Chat",
          messages: allMessages,
          persona,
        })
        .then(() => {});
    }

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
