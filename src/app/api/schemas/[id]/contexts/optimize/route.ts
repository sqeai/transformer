import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";
import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage } from "@langchain/core/messages";

const OPTIMIZE_PROMPT = `You are an instruction optimization specialist. Your job is to take a user's rough text describing validation rules, instructions, or context for a data processing AI agent, and rewrite it into a clear, precise, structured set of instructions that an AI agent can follow reliably.

Rules:
1. Preserve the original meaning and intent entirely.
2. Make instructions unambiguous and actionable.
3. Use bullet points or numbered lists for multiple instructions.
4. Add explicit edge-case handling where the original is vague.
5. Use consistent terminology.
6. Remove filler words and redundancy.
7. If the text describes validation rules, express them as clear conditional checks.
8. Keep the language concise but complete.

Return ONLY the optimized instruction text. Do not add any preamble, explanation, or markdown fences.`;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase, userId } = auth;
  const { id: schemaId } = await params;

  const { data: schema } = await supabase!
    .from("schemas")
    .select("id, user_id")
    .eq("id", schemaId)
    .single();
  if (!schema) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = schema.user_id === userId;
  const { data: grantRow } = await supabase!
    .from("schema_grants")
    .select("schema_id")
    .eq("schema_id", schemaId)
    .eq("granted_to_user_id", userId!)
    .maybeSingle();
  if (!isOwner && !grantRow) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { text?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  try {
    const model = new ChatAnthropic({
      modelName: "claude-sonnet-4-20250514",
      temperature: 0.2,
      maxTokens: 2048,
    });

    const response = await model.invoke([
      new HumanMessage(`${OPTIMIZE_PROMPT}\n\n--- USER TEXT ---\n${text}`),
    ]);

    const optimized = typeof response.content === "string"
      ? response.content.trim()
      : Array.isArray(response.content)
        ? response.content.map((c) => (typeof c === "string" ? c : "text" in c ? c.text : "")).join("").trim()
        : text;

    return NextResponse.json({ optimized });
  } catch (err) {
    console.error("Optimize context error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to optimize text" },
      { status: 500 },
    );
  }
}
