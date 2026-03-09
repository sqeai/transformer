import { NextRequest, NextResponse } from "next/server";
import { getAnalystAgent } from "@/lib/agents/analyst-agent";
import type { DataSourceContext, Persona, DimensionsLookupFn } from "@/lib/agents/analyst-agent";
import { requireAuth } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createConnector } from "@/lib/connectors";
import type { DataSourceType } from "@/lib/connectors";
import { type BaseMessage } from "@langchain/core/messages";
import { toUIMessageStream, toBaseMessages } from "@ai-sdk/langchain";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai";
import type { ChatAttachment } from "@/lib/chat-attachments";
import { saveChatOnFinish, markChatStreaming } from "@/lib/chat-persistence";
import {
  uploadFileToAnthropic,
  deleteFilesFromAnthropic,
  type UploadedFile,
} from "@/lib/anthropic-files";
import { downloadS3FileToTmp } from "@/lib/s3-files";
import { promises as fs } from "fs";

const ATTACHMENTS_META_RE = /<!-- ATTACHMENTS_META:([\s\S]*?) -->/;

/**
 * Parse embedded attachment metadata from a message's text content.
 */
function parseAttachmentsMeta(text: string): ChatAttachment[] {
  const match = text.match(ATTACHMENTS_META_RE);
  if (!match) return [];
  try {
    return JSON.parse(match[1]) as ChatAttachment[];
  } catch {
    return [];
  }
}

/**
 * Strip the ATTACHMENTS_META comment and the [Attached: ...] label from text,
 * leaving only the user's actual message.
 */
function stripAttachmentMarkers(text: string): string {
  return text
    .replace(/<!-- ATTACHMENTS_META:[\s\S]*? -->\n?/g, "")
    .replace(/^\[Attached: .+?\]\n\n/, "")
    .trim();
}

/**
 * Download a file from S3 and upload it to the Anthropic Files API.
 */
async function uploadS3FileToAnthropic(
  att: ChatAttachment,
): Promise<UploadedFile> {
  const tmpPath = await downloadS3FileToTmp(att.filePath);
  try {
    const buffer = await fs.readFile(tmpPath);
    return await uploadFileToAnthropic(buffer, att.fileName, att.mimeType);
  } finally {
    await fs.unlink(tmpPath).catch(() => {});
  }
}

export async function POST(req: NextRequest) {
  const uploadedAnthropicFileIds: string[] = [];

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
    const companyContext: string = body.companyContext ?? "";
    const chatId: string | null = body.chatId ?? null;

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

    // ── Collect all attachments from every user message ──
    // For the latest message, use body.attachments (has fresh S3 paths).
    // For historical messages, parse embedded ATTACHMENTS_META from the text.
    interface MessageAttachmentInfo {
      messageIndex: number;
      attachments: ChatAttachment[];
    }

    const allMessageAttachments: MessageAttachmentInfo[] = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg._getType() !== "human") continue;

      const isLastHuman = i === messages.length - 1;
      const text = typeof msg.content === "string" ? msg.content : "";

      if (isLastHuman && attachments.length > 0) {
        allMessageAttachments.push({ messageIndex: i, attachments });
      } else {
        const parsed = parseAttachmentsMeta(text);
        if (parsed.length > 0) {
          allMessageAttachments.push({ messageIndex: i, attachments: parsed });
        }
      }
    }

    const hasFileAttachments = allMessageAttachments.length > 0;

    // ── Upload all files to Anthropic Files API ──
    // Build a map: messageIndex → array of Anthropic file IDs
    const fileIdsByMessage = new Map<number, UploadedFile[]>();

    if (hasFileAttachments) {
      const uploadPromises: Promise<{ messageIndex: number; uploaded: UploadedFile }>[] = [];

      for (const { messageIndex, attachments: atts } of allMessageAttachments) {
        for (const att of atts) {
          uploadPromises.push(
            uploadS3FileToAnthropic(att).then((uploaded) => ({
              messageIndex,
              uploaded,
            })),
          );
        }
      }

      const results = await Promise.allSettled(uploadPromises);

      for (const result of results) {
        if (result.status !== "fulfilled") {
          console.error("[analyst-chat] Failed to upload file to Anthropic:", result.reason);
          continue;
        }
        const { messageIndex, uploaded } = result.value;
        uploadedAnthropicFileIds.push(uploaded.fileId);

        const existing = fileIdsByMessage.get(messageIndex) ?? [];
        existing.push(uploaded);
        fileIdsByMessage.set(messageIndex, existing);
      }
    }

    // ── Inject document content blocks into messages that have files ──
    for (const [messageIndex, uploadedFiles] of fileIdsByMessage) {
      const msg = messages[messageIndex];
      const originalText = typeof msg.content === "string" ? msg.content : "";
      const cleanText = stripAttachmentMarkers(originalText);

      const contentBlocks: Array<Record<string, unknown>> = [];

      for (const uf of uploadedFiles) {
        contentBlocks.push({
          type: "document",
          source: { type: "file", file_id: uf.fileId },
        });
      }

      contentBlocks.push({ type: "text", text: cleanText || "(see attached files)" });

      msg.content = contentBlocks as unknown as string;
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

      console.log("data", JSON.stringify(data, null, 2));

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
        hasFileAttachments,
      },
      { version: "v2", recursionLimit: 50 },
    );

    const userId = authResult.user.id;
    const langchainStream = toUIMessageStream(eventStream);

    if (chatId) {
      await markChatStreaming(chatId, userId);
    }

    const originalOnFinish = saveChatOnFinish({ chatId, userId });

    const stream = createUIMessageStream({
      execute({ writer }) {
        writer.merge(langchainStream);
      },
      originalMessages: rawMessages,
      onFinish: async (event) => {
        await originalOnFinish(event);
        // Delete all uploaded files from Anthropic to avoid data retention
        if (uploadedAnthropicFileIds.length > 0) {
          deleteFilesFromAnthropic(uploadedAnthropicFileIds).catch((err) =>
            console.error("[analyst-chat] Failed to cleanup Anthropic files:", err),
          );
        }
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (e: unknown) {
    // Clean up any uploaded files on error
    if (uploadedAnthropicFileIds.length > 0) {
      deleteFilesFromAnthropic(uploadedAnthropicFileIds).catch((err) =>
        console.error("[analyst-chat] Failed to cleanup Anthropic files on error:", err),
      );
    }
    const error = e as Error & { status?: number };
    return NextResponse.json(
      { error: error.message },
      { status: error.status ?? 500 },
    );
  }
}
