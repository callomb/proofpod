"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";
import { renderAcCertificatePdf } from "./certificate-pdf";
import type { AcCertificate, AcDocType } from "./types";

export interface AcCertIssueResult {
  error?: string;
  ok?: boolean;
  certificateId?: string;
  number?: string;
}

function pdfPath(cert: Pick<AcCertificate, "company_id" | "project_id" | "number">) {
  return `${cert.company_id}/${cert.project_id}/ac/${cert.number}.pdf`;
}

/** Issue one AC certificate/F-Gas document, then render + store its PDF. */
export async function issueAcCertificateAction(
  acSystemId: string,
  docType: AcDocType,
): Promise<AcCertIssueResult> {
  const supabase = await createClient();
  const { data: cert, error } = await supabase
    .rpc("issue_ac_certificate", { p_ac_system_id: acSystemId, p_doc_type: docType })
    .select()
    .single<AcCertificate>();
  if (error) return { error: error.message };

  try {
    const buffer = await renderAcCertificatePdf(cert.number, cert.doc_type, cert.snapshot);
    const path = pdfPath(cert);
    const admin = createAdminClient();
    const up = await admin.storage
      .from("certificates")
      .upload(path, buffer, { contentType: "application/pdf", upsert: true });
    if (up.error) throw new Error(up.error.message);
    await admin.from("ac_certificates").update({ pdf_path: path }).eq("id", cert.id);
  } catch (e) {
    return {
      ok: true,
      certificateId: cert.id,
      number: cert.number,
      error:
        "Certificate issued, but the PDF could not be pre-generated: " +
        (e instanceof Error ? e.message : "unknown error"),
    };
  }

  revalidatePath(`/admin/projects/${cert.project_id}`);
  return { ok: true, certificateId: cert.id, number: cert.number };
}

export interface ActionResult {
  error?: string;
  ok?: boolean;
}

export async function setAcProjectSettingsAction(
  projectId: string,
  plantOperator: string,
  operatorContact: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_ac_project_settings", {
    p_project_id: projectId,
    p_plant_operator: plantOperator || null,
    p_operator_contact: operatorContact || null,
  });
  if (error) return { error: error.message };
  revalidatePath(`/admin/projects/${projectId}`);
  return { ok: true };
}
