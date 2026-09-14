import { ChangePasswordForm } from "@/components/change-password-form";
import { ProfileForm } from "@/components/settings-forms";
import { BackLink } from "@/components/ui";
import { getWorkspace } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const { profile } = await getWorkspace();
  return (
    <div>
      <div className="mb-3">
        <BackLink href="/more">More</BackLink>
      </div>
      <h1 className="mb-6 text-[24px] font-semibold tracking-tight">Your details</h1>
      <ProfileForm fullName={profile.full_name} />
      {profile.username ? (
        <p className="mt-4 text-[13px] text-muted">
          Username: <span className="font-mono text-ink">{profile.username}</span>
        </p>
      ) : null}

      <div className="mt-10 border-t border-line pt-6">
        <h2 className="mb-4 text-[17px] font-semibold">Change password</h2>
        <ChangePasswordForm />
      </div>
    </div>
  );
}
