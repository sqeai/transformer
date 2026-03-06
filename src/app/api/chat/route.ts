import { NextRequest, NextResponse } from "next/server";
import { getAgentGraph, AIMessage } from "@/lib/agents/chat-agent";
import { getDocsOnlyAgent } from "@/lib/agents/docs-agent";
import { getAuthUser } from "@/lib/api-auth";
import { type BaseMessage } from "@langchain/core/messages";
import { toUIMessageStream, toBaseMessages } from "@ai-sdk/langchain";
import { createUIMessageStreamResponse, type UIMessage } from "ai";
import { resolveAttachments, type ChatAttachment } from "@/lib/chat-attachments";

const convertLangChainMessageToVercelMessage = (message: BaseMessage) => {
  if (message._getType() === "human") {
    return { content: message.content, role: "user" };
  } else if (message._getType() === "ai") {
    return {
      content: message.content,
      role: "assistant",
      tool_calls: (message as unknown as { tool_calls?: unknown[] }).tool_calls,
    };
  } else {
    return { content: message.content, role: message._getType() };
  }
};

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    const isAuthenticated = Boolean(user);

    const body = await req.json();
    const returnIntermediateSteps = body.show_intermediate_steps;
    const workspaceContext: string | null = body.workspaceContext ?? null;
    const attachments: ChatAttachment[] = Array.isArray(body.attachments) ? body.attachments : [];

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

    const agent = isAuthenticated ? getAgentGraph() : getDocsOnlyAgent();
    if (!agent) {
      return NextResponse.json(
        {
          error:
            "Agent not available. Please ensure ANTHROPIC_API_KEY is set.",
        },
        { status: 500 },
      );
    }

    if (!returnIntermediateSteps) {
      const eventStream = await agent.streamEvents(
        {
          messages,
          ...(isAuthenticated ? { workspaceContext } : {}),
        },
        { version: "v2", recursionLimit: 50 },
      );

      return createUIMessageStreamResponse({
        stream: toUIMessageStream(eventStream),
      });
    } else {
      const result = await agent.invoke(
        {
          messages,
          ...(isAuthenticated ? { workspaceContext } : {}),
        },
        { recursionLimit: 50 },
      );

      const validMessages = result.messages.map((m) => {
        if (typeof m === "string") return new AIMessage(m);
        return m as BaseMessage;
      });

      return NextResponse.json(
        {
          messages: validMessages.map(convertLangChainMessageToVercelMessage),
        },
        { status: 200 },
      );
    }
  } catch (e: unknown) {
    const error = e as Error & { status?: number };
    return NextResponse.json(
      { error: error.message },
      { status: error.status ?? 500 },
    );
  }
}
