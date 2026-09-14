import type { ReactNode } from "react";

import { PlatformHeader, PlatformShell } from "@/components/platform/platform-shell";
import { requirePlatformAdmin } from "@/lib/platform";

export const dynamic = "force-dynamic";

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  await requirePlatformAdmin();
  return (
    <div className="min-h-dvh bg-canvas">
      <PlatformHeader />
      <PlatformShell>{children}</PlatformShell>
    </div>
  );
}
