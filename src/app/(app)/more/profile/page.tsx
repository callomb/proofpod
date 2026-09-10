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
    </div>
  );
}
