import type { SupabaseClient } from "@supabase/supabase-js";

export type SheetType = "raw" | "processed" | "intermediary";

export interface SheetDimensions {
  rowCount: number;
  columnCount: number;
}

export interface SheetRow {
  id: string;
  user_id: string;
  storage_url: string;
  name: string;
  dimensions: SheetDimensions;
  type: SheetType;
  version_id: string | null;
}

interface CreateSheetParams {
  userId: string;
  storageUrl: string;
  name: string;
  dimensions: SheetDimensions;
  type: SheetType;
}

export async function createSheetRecord(supabase: SupabaseClient, params: CreateSheetParams): Promise<SheetRow> {
  const { data, error } = await supabase
    .from("sheets")
    .insert({
      user_id: params.userId,
      storage_url: params.storageUrl,
      name: params.name,
      dimensions: params.dimensions,
      type: params.type,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create sheet record: ${error.message}`);
  }

  return data as SheetRow;
}

export async function updateSheetVersionId(
  supabase: SupabaseClient,
  sheetId: string,
  versionId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("sheets")
    .update({
      version_id: versionId,
    })
    .eq("id", sheetId);

  if (error) {
    throw new Error(`Failed to update sheet version id: ${error.message}`);
  }
}
