import { NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";
import { createDefaultBigQueryConnector, isDefaultBigQueryAvailable } from "@/lib/connectors/default-bigquery";

export async function GET() {
  const auth = await getAuth();
  if (auth.response) return auth.response;

  if (!isDefaultBigQueryAvailable()) {
    return NextResponse.json({ tables: [] });
  }

  const connector = createDefaultBigQueryConnector();
  if (!connector) {
    return NextResponse.json({ tables: [] });
  }

  try {
    const tables = await connector.listTables();
    return NextResponse.json({ tables });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  } finally {
    await connector.close();
  }
}
