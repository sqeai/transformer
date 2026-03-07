import { promises as fs } from "fs";
import path from "path";
import { ChatAnthropic } from "@langchain/anthropic";
import { createAgent } from "langchain";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";

const DOCS_ONLY_SYSTEM_PROMPT = `You are the public documentation assistant for the Starlight application.

Your behavior rules are strict:
1. Only answer questions about this app (features, workflows, setup, usage, routes, export options, and behavior) using the provided README content.
2. If the user asks anything unrelated to the app, refuse and say: "I can only help with Starlight app documentation and usage."
3. If the answer is not present in the README content, say you do not have that detail in the documentation.
4. Do not invent facts and do not use outside knowledge.
5. Keep responses concise and practical.`;

export interface DocsInvokeOptions {
  messages: BaseMessage[];
}

export interface DocsInvokeResult {
  messages: BaseMessage[];
}

let cachedReadme: string | null = null;

async function getReadmeContent() {
  if (cachedReadme) return cachedReadme;
  const readmePath = path.join(process.cwd(), "README.md");
  cachedReadme = await fs.readFile(readmePath, "utf8");
  return cachedReadme;
}

async function createDocsAgent(apiKey: string) {
  const readme = await getReadmeContent();
  const llm = new ChatAnthropic({
    model: "claude-sonnet-4-20250514",
    anthropicApiKey: apiKey,
    temperature: 0,
  });

  return createAgent({
    model: llm,
    tools: [],
    systemPrompt: `${DOCS_ONLY_SYSTEM_PROMPT}\n\nREADME content:\n${readme}`,
  });
}

export class DocsOnlyAgent {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async invoke(
    inputs: DocsInvokeOptions,
    config?: { recursionLimit?: number },
  ): Promise<DocsInvokeResult> {
    try {
      const agent = await createDocsAgent(this.apiKey);
      const result = await agent.invoke({ messages: inputs.messages }, config);
      if (result && typeof result === "object" && "messages" in result) {
        return { messages: result.messages as BaseMessage[] };
      }
      return { messages: [new AIMessage(JSON.stringify(result))] };
    } catch (error) {
      return {
        messages: [new AIMessage(`Error: ${(error as Error).message}`)],
      };
    }
  }

  async streamEvents(inputs: DocsInvokeOptions, config?: Record<string, unknown>) {
    const agent = await createDocsAgent(this.apiKey);
    return agent.streamEvents({ messages: inputs.messages }, config);
  }
}

let docsAgent: DocsOnlyAgent | null = null;

export function getDocsOnlyAgent(): DocsOnlyAgent | null {
  if (docsAgent) return docsAgent;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY environment variable is required");
    return null;
  }
  docsAgent = new DocsOnlyAgent(apiKey);
  return docsAgent;
}
