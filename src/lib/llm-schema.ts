import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage, type BaseMessage } from "@langchain/core/messages";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import type { SchemaField } from "./types";
import {
  extractWorkbookPreview,
  formatPreviewAsText,
} from "./parse-excel-preview";

const SYSTEM_PROMPT = `You are a data-schema analyst. Given a preview of an Excel workbook (headers + sample rows), produce the best possible target schema.

Rules:
1. Identify which columns are meaningful data fields vs noise (row numbers, empty padding, internal IDs that are clearly auto-generated).
2. Group related columns under a common parent when it makes semantic sense (e.g. "First Name" and "Last Name" → parent "name" with children "first" and "last"; or "Address Line 1", "City", "State", "Zip" → parent "address").
3. Normalise field names to clean camelCase (e.g. "CUST_EMAIL" → "customerEmail", "Addr Line 1" → "addressLine1").
4. Assign a nesting level: 0 for top-level, 1 for children of a group, etc.
5. Preserve a logical ordering that groups related fields together.
6. Keep the schema practical — don't over-nest. One level of nesting is usually enough.

Respond ONLY with a JSON array (no markdown fences, no commentary). Each element must have:
- "name": string (clean display name)
- "path": string (dot-separated path, e.g. "address.city")
- "level": number (nesting depth, 0 = top)
- "originalColumn": string (the raw header this maps to, or "" for group parents)

Example output:
[
  {"name":"id","path":"id","level":0,"originalColumn":"Customer ID"},
  {"name":"name","path":"name","level":0,"originalColumn":""},
  {"name":"first","path":"name.first","level":1,"originalColumn":"First Name"},
  {"name":"last","path":"name.last","level":1,"originalColumn":"Last Name"},
  {"name":"email","path":"email","level":0,"originalColumn":"Email Address"}
]`;

interface LlmSchemaField {
  name: string;
  path: string;
  level: number;
  originalColumn: string;
}

function buildFieldTree(flat: LlmSchemaField[]): SchemaField[] {
  const result: SchemaField[] = [];
  const parentStack: SchemaField[] = [];

  for (let i = 0; i < flat.length; i++) {
    const f = flat[i];
    const field: SchemaField = {
      id: crypto.randomUUID(),
      name: f.name,
      path: f.path,
      level: f.level,
      order: i,
      children: [],
    };

    if (f.level === 0) {
      result.push(field);
      parentStack.length = 0;
      parentStack.push(field);
    } else {
      while (parentStack.length > f.level) {
        parentStack.pop();
      }
      const parent = parentStack[parentStack.length - 1];
      if (parent) {
        if (!parent.children) parent.children = [];
        parent.children.push(field);
      } else {
        result.push(field);
      }
      parentStack.push(field);
    }
  }

  return result;
}

export async function detectSchemaWithLLM(
  buffer: ArrayBuffer,
): Promise<SchemaField[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const preview = await extractWorkbookPreview(buffer);
  if (preview.headers.length === 0) {
    throw new Error("Workbook has no headers to analyse");
  }

  const previewText = formatPreviewAsText(preview);

  const llm = new ChatAnthropic({
    model: "claude-sonnet-4-20250514",
    anthropicApiKey: apiKey,
    temperature: 0,
  });

  const agent = createReactAgent({
    llm,
    tools: [],
    prompt: SYSTEM_PROMPT,
  });

  const result = await agent.invoke({
    messages: [
      new HumanMessage(
        `Analyse this workbook preview and produce the target schema:\n\n${previewText}`,
      ),
    ],
  });

  const messages = result.messages as BaseMessage[];
  const lastMessage = messages[messages.length - 1];
  const text =
    typeof lastMessage.content === "string"
      ? lastMessage.content
      : JSON.stringify(lastMessage.content);

  let parsed: LlmSchemaField[];
  try {
    const cleaned = text
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(
      `LLM returned invalid JSON. Raw response:\n${text.slice(0, 500)}`,
    );
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("LLM returned an empty or non-array schema");
  }

  return buildFieldTree(parsed);
}
