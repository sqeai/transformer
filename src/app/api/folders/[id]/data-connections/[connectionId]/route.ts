import { NextRequest, NextResponse } from "next/server";
import { requireFolderAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; connectionId: string }> },
) {
  const { id, connectionId } = await params;
  const access = await requireFolderAccess(id, "manage_folder");
  if (access.error) return access.error;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("folder_data_connections")
    .delete()
    .eq("id", connectionId)
    .eq("folder_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
