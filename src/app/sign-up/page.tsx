import { SignUpForm } from "@/components/auth-forms";
import { Wordmark } from "@/components/wordmark";

export default async function SignUpPage(props: PageProps<"/sign-up">) {
  const { invite } = await props.searchParams;
  const inviteToken = typeof invite === "string" ? invite : undefined;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[400px] flex-col justify-center px-6 py-16">
      <Wordmark className="mb-1 text-2xl" />
      <p className="mb-8 text-[15px] text-muted">
        {inviteToken ? "Join your team on ProofPod." : "Set up your company on ProofPod."}
      </p>
      <SignUpForm invite={inviteToken} />
    </main>
  );
}
