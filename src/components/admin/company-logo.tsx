"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { updateCompanyLogoAction } from "@/lib/actions";
import { createClient } from "@/lib/supabase/client";
import { Button, Card } from "@/components/ui";

export function CompanyLogo({
  companyId,
  logoUrl,
}: {
  companyId: string;
  logoUrl: string | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    start(async () => {
      try {
        const supabase = createClient();
        const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
        const path = `${companyId}/logo-${crypto.randomUUID()}.${ext || "png"}`;
        const { error: upErr } = await supabase.storage
          .from("branding")
          .upload(path, file, { contentType: file.type || "image/png", upsert: true });
        if (upErr) throw new Error(upErr.message);
        const res = await updateCompanyLogoAction(companyId, path);
        if (res.error) throw new Error(res.error);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      }
    });
  };

  return (
    <Card className="p-5">
      <h3 className="text-[15px] font-semibold">Company logo</h3>
      <p className="mt-0.5 text-[13px] text-muted">Appears on generated certificates.</p>
      <div className="mt-4 flex items-center gap-4">
        <div className="grid h-16 w-28 place-items-center overflow-hidden rounded-lg border border-line bg-canvas">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Company logo" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-[11px] text-faint">No logo</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => fileRef.current?.click()}
          >
            {pending ? "Uploading…" : logoUrl ? "Replace" : "Upload logo"}
          </Button>
          {logoUrl ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await updateCompanyLogoAction(companyId, null);
                  if (res.error) setError(res.error);
                  else router.refresh();
                })
              }
            >
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      {error ? <p className="mt-2 text-[12px] text-fail">{error}</p> : null}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={onFile}
      />
    </Card>
  );
}
