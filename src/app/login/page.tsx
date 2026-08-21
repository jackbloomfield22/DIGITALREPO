import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { login } from "./actions";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect("/creators");
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="font-display text-3xl font-bold tracking-tight">
            4.4.FORTY
          </div>
          <div className="overline mt-2">Digital Bible</div>
        </div>
        <form action={login} className="card space-y-4 p-6">
          {error && (
            <p className="rounded bg-accent-wash px-3 py-2 text-sm text-accent-deep">
              {error === "credentials"
                ? "That email and password didn't match."
                : "Sign-in failed. Try again."}
            </p>
          )}
          <div>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1"
            />
          </div>
          <button type="submit" className="btn btn-primary w-full">
            Sign in
          </button>
          <p className="text-center text-xs text-faint">
            Internal tool · 4.4.Forty Media
          </p>
        </form>
      </div>
    </div>
  );
}
