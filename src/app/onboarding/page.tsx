import { redirect } from "next/navigation";

import { OnboardingForm } from "@/components/onboarding-form";
import { Wordmark } from "@/components/wordmark";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OnboardingPage(props: PageProps<"/onboarding">) {
  const { invite } = await props.searchParams;
  const inviteToken = typeof invite === "string" ? invite : undefined;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  // Already in a company? go home.
  const { data: membership } = await supabase
    .from("company_members")
    .select("id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (membership) redirect("/home");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single<{ full_name: string }>();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[400px] flex-col justify-center px-6 py-16">
      <Wordmark className="mb-1 text-2xl" />
      <p className="mb-8 text-[15px] text-muted">
        {inviteToken
          ? "Confirm your details to join your team."
          : "One more step — set up your company."}
      </p>
      <OnboardingForm fullName={profile?.full_name ?? ""} invite={inviteToken} />
    </main>
  );
}
