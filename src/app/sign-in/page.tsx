import { SignInForm } from "@/components/auth-forms";
import { Wordmark } from "@/components/wordmark";

export default async function SignInPage(props: PageProps<"/sign-in">) {
  const { next } = await props.searchParams;
  // Empty => signInAction routes by role (admins land on the admin portal).
  const target = typeof next === "string" && next.startsWith("/") ? next : "";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[400px] flex-col justify-center px-6 py-16">
      <Wordmark className="mb-1 text-2xl" />
      <p className="mb-8 text-[15px] text-muted">Evidence capture for pressure testing.</p>
      <SignInForm next={target} />
    </main>
  );
}
