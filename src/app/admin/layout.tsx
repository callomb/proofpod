import type { ReactNode } from "react";

import { AdminHeader, AdminShell } from "@/components/admin/admin-shell";
import { requireAdmin } from "@/lib/data";
import { initials } from "@/lib/domain";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { profile } = await requireAdmin();
  return (
    <div className="min-h-dvh bg-canvas">
      <AdminHeader initials={initials(profile.full_name)} name={profile.full_name} />
      <AdminShell>{children}</AdminShell>
    </div>
  );
}
