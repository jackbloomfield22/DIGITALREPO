import { redirect } from "next/navigation";

// The default logged-in experience is the talent roster.
export default function Home() {
  redirect("/talent");
}
