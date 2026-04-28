import { redirect } from "next/navigation";

// Force dynamic so Next.js doesn't try to statically pre-render this redirect
export const dynamic = "force-dynamic";

export default function Home() {
  redirect("/dashboard");
}
