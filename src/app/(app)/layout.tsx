import type { ReactNode } from "react";

import { AppHeader, BottomNav } from "@/components/app-shell";
import { Screen } from "@/components/ui";
import { getWorkspace } from "@/lib/data";
import { initials } from "@/lib/domain";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { profile } = await getWorkspace();
  return (
    <>
      <Screen>
        <AppHeader initials={initials(profile.full_name)} />
        {children}
      </Screen>
      <BottomNav />
    </>
  );
}
