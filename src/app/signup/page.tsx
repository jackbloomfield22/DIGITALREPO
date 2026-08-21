import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { signup } from "./actions";

export const metadata = { title: "Create account" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect("/creators");
  const { error } = await searchParams;
  const codeRequired = !!process.env.SIGNUP_CODE;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="font-display text-3xl font-bold tracking-tight">4.4.FORTY</div>
          <div className="overline mt-2">Digital Bible</div>
        </div>
        <form action={signup} className="card space-y-4 p-6">
          <h1 className="text-base font-semibold">Create your account</h1>
          <p className="text-xs text-muted">
            Everyone works in the same shared Digital Bible — every change you make is
            recorded under your name.
          </p>
          {error && (
            <p className="rounded bg-accent-wash px-3 py-2 text-sm text-accent-deep">{error}</p>
          )}
          <div>
            <label htmlFor="name">Name</label>
            <input id="name" name="name" type="text" required autoComplete="name" className="mt-1" />
          </div>
          <div>
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required autoComplete="email" className="mt-1" />
          </div>
          <div>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="mt-1"
            />
            <p className="mt-1 text-xs text-faint">At least 8 characters.</p>
          </div>
          {codeRequired && (
            <div>
              <label htmlFor="code">Invite code</label>
              <input id="code" name="code" type="text" required className="mt-1" />
            </div>
          )}
          <button type="submit" className="btn btn-primary w-full">
            Create Account
          </button>
          <p className="text-center text-xs text-muted">
            Already have an account?{" "}
            <Link href="/login" className="underline underline-offset-2 hover:text-accent">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
