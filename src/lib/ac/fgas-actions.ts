"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "../supabase/server";
import type { AcFgasLabelRequest } from "./types";

export interface FgasResult {
  ok?: boolean;
  error?: string;
}

/** POSTs the frozen payload to Tagref and records the outcome on the request. */
async function deliver(request: AcFgasLabelRequest): Promise<FgasResult> {
  const supabase = await createClient();
  const url = process.env.TAGREF_FGAS_URL;
  const key = process.env.TAGREF_FGAS_KEY;

  let failure: string | null = null;
  if (!url || !key) {
    failure = "The connection to Tagref isn't set up yet.";
  } else {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key },
        body: JSON.stringify(request.payload),
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) failure = `Tagref replied with an error (${res.status}).`;
    } catch {
      failure = "Couldn't reach Tagref.";
    }
  }

  const { error } = await supabase.rpc("record_ac_fgas_label_send", {
    p_request_id: request.id,
    p_ok: failure === null,
    p_error: failure,
  });
  revalidatePath("/", "layout");
  if (error) return { error: error.message };
  return failure ? { error: failure } : { ok: true };
}

/** Saves the label request (once per system) and sends it to Tagref. */
export async function requestAcFgasLabelAction(acSystemId: string): Promise<FgasResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("request_ac_fgas_label", { p_ac_system_id: acSystemId })
    .select()
    .single<AcFgasLabelRequest>();
  if (error) return { error: error.message };
  if (data.status === "sent") return { ok: true };
  return deliver(data);
}

/** Re-sends a request that previously failed. */
export async function retryAcFgasLabelAction(requestId: string): Promise<FgasResult> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ac_fgas_label_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle<AcFgasLabelRequest>();
  if (!data) return { error: "Request not found." };
  if (data.status === "sent") return { ok: true };
  return deliver(data);
}
