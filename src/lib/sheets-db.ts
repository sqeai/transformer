import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SheetType = "raw" | "processed" | "intermediary" | "final";

export interface SheetDimensions {
  rowCount: number;
  columnCount: number;
}

export interface SheetRow {
  id: string;
  user_id: string;
  sheet_id: string;
  storage_url: string;
  name: string;
  dimensions: SheetDimensions;
  type: SheetType;
  version_id: number;
}

interface CreateSheetParams {
  userId: string;
  sheetId?: string;
  storageUrl: string;
  name: string;
  dimensions: SheetDimensions;
  type: SheetType;
}

export function generateSheetId(): string {
  return randomUUID().replace(/-/g, "");
}

export async function createSheetRecord(supabase: SupabaseClient, params: CreateSheetParams): Promise<SheetRow> {
  const sheetId = params.sheetId ?? generateSheetId();

  const { data, error } = await supabase
    .from("sheets")
    .insert({
      user_id: params.userId,
      sheet_id: sheetId,
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
