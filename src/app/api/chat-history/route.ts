import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult.error) return authResult.error;

  const supabase = createAdminClient();
  const agentType = req.nextUrl.searchParams.get("agentType") || "analyst";
  const folderId = req.nextUrl.searchParams.get("folderId");

  let query = supabase
    .from("chat_history")
    .select("id, title, agent_type, persona, folder_id, streaming_status, created_at, updated_at")
    .eq("user_id", authResult.user.id)
    .eq("agent_type", agentType)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (folderId) {
    query = query.eq("folder_id", folderId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult.error) return authResult.error;

  const supabase = createAdminClient();
  const body = await req.json();

  const { data, error } = await supabase
    .from("chat_history")
    .insert({
      user_id: authResult.user.id,
      agent_type: body.agentType || "analyst",
      title: body.title || "Untitled Chat",
      messages: body.messages || [],
      persona: body.persona || null,
      folder_id: body.folderId || null,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
