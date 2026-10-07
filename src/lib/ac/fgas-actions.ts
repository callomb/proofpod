"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "../supabase/server";
import type { AcFgasLabelRequest } from "./types";

export interface FgasResult {
  ok?: boolean;
  error?: string;
}

/** Saves the label request (once per system); Tagref reads it from the shared database. */
export async function requestAcFgasLabelAction(acSystemId: string): Promise<FgasResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .rpc("request_ac_fgas_label", { p_ac_system_id: acSystemId })
    .select()
    .single<AcFgasLabelRequest>();
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}
