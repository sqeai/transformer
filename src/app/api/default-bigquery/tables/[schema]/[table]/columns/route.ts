import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";
import { createDefaultBigQueryConnector, isDefaultBigQueryAvailable } from "@/lib/connectors/default-bigquery";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ schema: string; table: string }> },
) {
  const auth = await getAuth();
  if (auth.response) return auth.response;

  const { schema, table } = await params;

  if (!isDefaultBigQueryAvailable()) {
    return NextResponse.json({ columns: [] });
  }

  const connector = createDefaultBigQueryConnector();
  if (!connector) {
    return NextResponse.json({ columns: [] });
  }

  try {
    const columns = await connector.getColumns(
      decodeURIComponent(schema),
      decodeURIComponent(table),
    );
    return NextResponse.json({ columns });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  } finally {
    await connector.close();
  }
}
