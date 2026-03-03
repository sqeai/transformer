import { NextRequest, NextResponse } from "next/server";
import { inferSchemaFromTextWithLLM } from "@/lib/llm-schema";
import type { SqlCompatibleType } from "@/lib/types";

function toSnakeCase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function uniqueSnakeCaseValues(values: string[]): string[] {
  const seen = new Set<string>();
  return values.map((value, index) => {
    const base = toSnakeCase(value) || `field_${index + 1}`;
    let next = base;
    let suffix = 2;
    while (seen.has(next)) {
      next = `${base}_${suffix}`;
      suffix += 1;
    }
    seen.add(next);
    return next;
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as { input?: unknown } | null;
    const input = typeof body?.input === "string" ? body.input.trim() : "";

    if (!input) {
      return NextResponse.json({ error: "input is required" }, { status: 400 });
    }

    const inferred = await inferSchemaFromTextWithLLM(input);
    const names = uniqueSnakeCaseValues(inferred.fields.map((f) => f.name));

    const fields = names.map((name, order) => {
      const dataType = inferred.fields[order]?.dataType as SqlCompatibleType | undefined;
      return {
        id: crypto.randomUUID(),
        name,
        path: name,
        level: 0,
        order,
        dataType: dataType ?? "STRING",
        children: [],
      };
    });

    return NextResponse.json({
      schemaName: toSnakeCase(inferred.schemaName) || "generated_schema",
      fields,
    });
  } catch (error) {
    console.error("Schema agent error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to infer schema" },
      { status: 500 },
    );
  }
}
