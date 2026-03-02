import { NextRequest, NextResponse } from "next/server";
import { getAgentGraph, AIMessage } from "@/lib/agents/chat-agent";
import { getDocsOnlyAgent } from "@/lib/agents/docs-agent";
import { createClient } from "@/lib/supabase/server";
import { type BaseMessage } from "@langchain/core/messages";
import { toUIMessageStream, toBaseMessages } from "@ai-sdk/langchain";
import { createUIMessageStreamResponse, type UIMessage } from "ai";

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
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    const isAuthenticated = Boolean(user && !userError);

    const body = await req.json();
    const returnIntermediateSteps = body.show_intermediate_steps;
    const workspaceContext: string | null = body.workspaceContext ?? null;

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
