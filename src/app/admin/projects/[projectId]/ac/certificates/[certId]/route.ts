import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderAcCertificatePdf } from "@/lib/ac/certificate-pdf";
import type { AcCertificate } from "@/lib/ac/types";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: RouteContext<"/admin/projects/[projectId]/ac/certificates/[certId]">,
) {
  const { certId } = await ctx.params;

  // RLS: only an admin of the owning company can select the certificate.
  const supabase = await createClient();
  const { data: cert } = await supabase
    .from("ac_certificates")
    .select("*")
    .eq("id", certId)
    .maybeSingle<AcCertificate>();

  if (!cert) return new Response("Not found", { status: 404 });

  const admin = createAdminClient();
  const path = cert.pdf_path ?? `${cert.company_id}/${cert.project_id}/ac/${cert.number}.pdf`;

  let bytes: Uint8Array | null = null;

  if (cert.pdf_path) {
    const { data } = await admin.storage.from("certificates").download(cert.pdf_path);
    if (data) bytes = new Uint8Array(await data.arrayBuffer());
  }

  if (!bytes) {
    const buffer = await renderAcCertificatePdf(cert.number, cert.doc_type, cert.snapshot);
    bytes = new Uint8Array(buffer);
    await admin.storage.from("certificates").upload(path, buffer, { contentType: "application/pdf", upsert: true });
    if (!cert.pdf_path) {
      await admin.from("ac_certificates").update({ pdf_path: path }).eq("id", cert.id);
    }
  }

  return new Response(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="ProofPod-${cert.number}.pdf"`,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
