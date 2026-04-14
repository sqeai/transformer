import { NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";
import { isDefaultBigQueryAvailable, getDefaultSchemaPrefix, getDefaultBqDataSourceId, DEFAULT_BQ_DATA_SOURCE_NAME } from "@/lib/connectors/default-bigquery";

export async function GET() {
  const auth = await getAuth();
  if (auth.response) return auth.response;

  const available = isDefaultBigQueryAvailable();
  const dataSourceId = available ? await getDefaultBqDataSourceId() : null;
  return NextResponse.json({
    available,
    name: DEFAULT_BQ_DATA_SOURCE_NAME,
    prefix: available ? getDefaultSchemaPrefix() : null,
    dataSourceId,
  });
}
