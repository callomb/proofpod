import Link from "next/link";

import { DemoDataButton, SignOutButton } from "@/components/more-menu";
import { Card } from "@/components/ui";
import { getWorkspace } from "@/lib/data";
import { roleLabel } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MorePage() {
  const { profile, company, membership, isAdmin } = await getWorkspace();

  return (
    <div>
      <h1 className="mb-5 text-[24px] font-semibold tracking-tight">More</h1>

      <Card className="mb-6 p-4">
        <p className="text-[16px] font-semibold">{profile.full_name || "Your name"}</p>
        <p className="text-[13px] text-muted">{profile.email}</p>
        <p className="mt-2 text-[13px] text-muted">
          {company.name} · {roleLabel(membership.role)}
        </p>
        <Link
          href="/more/profile"
          className="mt-3 inline-block text-[13px] font-medium text-ink underline underline-offset-2"
        >
          Edit your name
        </Link>
      </Card>

      {isAdmin ? (
        <Link
          href="/admin/projects"
          className="mb-6 flex items-center justify-between rounded-card border border-line bg-paper px-4 py-3.5 text-[15px] font-medium active:bg-canvas"
        >
          Open the admin portal
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-faint" aria-hidden>
            <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      ) : null}

      <div className="space-y-3">
        <DemoDataButton />
        <SignOutButton />
      </div>

      <p className="mt-8 text-center text-[11px] text-faint">ProofPod beta</p>
    </div>
  );
}
