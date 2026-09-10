import Link from "next/link";

import { DemoDataButton, SignOutButton } from "@/components/more-menu";
import { Card } from "@/components/ui";
import { getWorkspace } from "@/lib/data";

export const dynamic = "force-dynamic";

const LINKS = [
  { href: "/more/company", label: "Company & default test values" },
  { href: "/more/team", label: "Team" },
  { href: "/more/archived", label: "Archived projects" },
];

export default async function MorePage() {
  const { profile, company, membership } = await getWorkspace();

  return (
    <div>
      <h1 className="mb-5 text-[24px] font-semibold tracking-tight">More</h1>

      <Card className="mb-6 p-4">
        <p className="text-[16px] font-semibold">{profile.full_name || "Your name"}</p>
        <p className="text-[13px] text-muted">{profile.email}</p>
        <p className="mt-2 text-[13px] text-muted">
          {company.name} · {membership.role}
        </p>
        <Link
          href="/more/profile"
          className="mt-3 inline-block text-[13px] font-medium text-ink underline underline-offset-2"
        >
          Edit your name
        </Link>
      </Card>

      <div className="overflow-hidden rounded-card border border-line bg-paper">
        {LINKS.map((l, i) => (
          <Link
            key={l.href}
            href={l.href}
            className={`flex items-center justify-between px-4 py-3.5 text-[15px] active:bg-canvas ${
              i > 0 ? "border-t border-line" : ""
            }`}
          >
            {l.label}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-faint" aria-hidden>
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        ))}
      </div>

      <div className="mt-6 space-y-3">
        <DemoDataButton />
        <SignOutButton />
      </div>

      <p className="mt-8 text-center text-[11px] text-faint">ProofPod beta</p>
    </div>
  );
}
