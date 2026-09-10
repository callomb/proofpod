import { redirect } from "next/navigation";
import { landingPath } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function IndexPage() {
  redirect(await landingPath());
}
