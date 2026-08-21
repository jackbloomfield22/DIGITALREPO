import { redirect } from "next/navigation";

// The default logged-in experience is the creator roster.
export default function Home() {
  redirect("/creators");
}
