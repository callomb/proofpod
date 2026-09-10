"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { seedDemoAction, signOutAction } from "@/lib/actions";
import { Button } from "./ui";

export function DemoDataButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div>
      <Button
        variant="secondary"
        className="w-full"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await seedDemoAction();
            setMsg(res.error ?? "Demo projects added.");
            if (!res.error) router.push("/home");
          })
        }
      >
        {pending ? "Adding…" : "Load demo projects"}
      </Button>
      {msg ? <p className="mt-2 text-[12px] text-muted">{msg}</p> : null}
    </div>
  );
}

export function SignOutButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      className="w-full text-fail"
      disabled={pending}
      onClick={() => start(() => signOutAction())}
    >
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
