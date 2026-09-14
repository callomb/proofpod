"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "./supabase/server";
import { createAdminClient } from "./supabase/admin";
import { renderCertificatePdf } from "./certificate-pdf";
import type { Certificate } from "./types";

export interface CertIssueResult {
  error?: string;
  ok?: boolean;
  certificateId?: string;
  number?: string;
}

function pdfPath(cert: Pick<Certificate, "company_id" | "project_id" | "number">) {
  return `${cert.company_id}/${cert.project_id}/${cert.number}.pdf`;
}

/** Issue a certificate for the selected passed tests, then render + store its PDF. */
export async function issueCertificateAction(
  projectId: string,
  testIds: string[],
): Promise<CertIssueResult> {
  if (testIds.length === 0) return { error: "Select at least one passed test." };

  const supabase = await createClient();
  const { data: cert, error } = await supabase
    .rpc("issue_certificate", { p_project_id: projectId, p_test_ids: testIds })
    .select()
    .single<Certificate>();
  if (error) return { error: error.message };

  try {
    const buffer = await renderCertificatePdf(cert.number, cert.snapshot);
    const path = pdfPath(cert);
    const admin = createAdminClient();
    const up = await admin.storage
      .from("certificates")
      .upload(path, buffer, { contentType: "application/pdf", upsert: true });
    if (up.error) throw new Error(up.error.message);
    await admin.from("certificates").update({ pdf_path: path }).eq("id", cert.id);
  } catch (e) {
    // The certificate record + snapshot exist; the PDF can be regenerated on
    // download. Surface the issue but don't lose the certificate.
    return {
      ok: true,
      certificateId: cert.id,
      number: cert.number,
      error:
        "Certificate issued, but the PDF could not be pre-generated: " +
        (e instanceof Error ? e.message : "unknown error"),
    };
  }

  revalidatePath(`/admin/projects/${projectId}`);
  return { ok: true, certificateId: cert.id, number: cert.number };
}
