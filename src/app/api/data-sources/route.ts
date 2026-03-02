import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";

export async function GET() {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase, userId } = auth;

  const { data, error } = await supabase!
    .from("data_sources")
    .select("id, name, type, config, created_at, updated_at")
    .eq("user_id", userId!)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    dataSources: (data ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      config: d.config,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
    })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase, userId } = auth;

  let body: { name?: string; type?: string; config?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const type = body.type;
  const config = body.config ?? {};

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const validTypes = ["bigquery", "mysql", "postgres", "redshift"];
  if (!type || !validTypes.includes(type)) {
    return NextResponse.json({ error: `type must be one of: ${validTypes.join(", ")}` }, { status: 400 });
  }

  const { data, error } = await supabase!
    .from("data_sources")
    .insert({ user_id: userId!, name, type, config })
    .select("id, name, type, config, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    dataSource: {
      id: data.id,
      name: data.name,
      type: data.type,
      config: data.config,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  });
}
