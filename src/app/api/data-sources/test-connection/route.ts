import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";
import { createConnector } from "@/lib/connectors";
import type { DataSourceType } from "@/lib/connectors";

export async function POST(request: NextRequest) {
  const auth = await getAuth();
  if (auth.response) return auth.response;

  let body: { type?: string; config?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const type = body.type as DataSourceType;
  const validTypes = ["bigquery", "mysql", "postgres", "redshift"];
  if (!type || !validTypes.includes(type)) {
    return NextResponse.json({ error: `type must be one of: ${validTypes.join(", ")}` }, { status: 400 });
  }

  const connector = createConnector(type, body.config ?? {});
  try {
    const result = await connector.testConnection();
    return NextResponse.json(result);
  } finally {
    await connector.close();
  }
}
