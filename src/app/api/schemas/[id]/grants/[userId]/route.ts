import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/api-auth";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const auth = await getAuth();
  if (auth.response) return auth.response;
  const { supabase, userId } = auth;
  const { id: schemaId, userId: grantedUserId } = await params;

  const { data: schema, error: schemaError } = await supabase!
    .from("schemas")
    .select("id, user_id")
    .eq("id", schemaId)
    .single();

  if (schemaError || !schema || schema.user_id !== userId) {
    return NextResponse.json(
      { error: schema?.user_id !== userId ? "Forbidden" : schemaError?.message ?? "Not found" },
      { status: schema?.user_id !== userId ? 403 : schemaError?.code === "PGRST116" ? 404 : 500 },
    );
  }

  const { error: deleteError } = await supabase!
    .from("schema_grants")
    .delete()
    .eq("schema_id", schemaId)
    .eq("granted_to_user_id", grantedUserId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
