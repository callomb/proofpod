import { SignOutButton } from "@/components/more-menu";
import { Wordmark } from "@/components/wordmark";

export const dynamic = "force-dynamic";

export default function DeactivatedPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[400px] flex-col justify-center gap-3 px-6 text-center">
      <Wordmark className="text-xl" />
      <h1 className="mt-2 text-[18px] font-semibold">Your access has been deactivated</h1>
      <p className="text-[14px] text-muted">
        An admin at your company has removed your access to ProofPod. Your past work and
        attribution are unchanged. Contact your admin if you think this is a mistake.
      </p>
      <div className="mt-4">
        <SignOutButton />
      </div>
    </main>
  );
}
