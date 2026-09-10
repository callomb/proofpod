import Link from "next/link";

import { Wordmark } from "@/components/wordmark";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[400px] flex-col items-center justify-center gap-3 px-6 text-center">
      <Wordmark className="text-xl" />
      <p className="text-[15px] text-muted">That page doesn&rsquo;t exist.</p>
      <Link href="/home" className="text-[14px] font-semibold underline underline-offset-2">
        Go home
      </Link>
    </main>
  );
}
