import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { cache } from "react";
import { db } from "@/lib/db";
import type { UserRole } from "@/lib/taxonomy";
import { hasRole, type SessionUser } from "@/lib/roles";

export { hasRole };
export type { SessionUser };

const COOKIE_NAME = "db_session";
const secret = () => {
  // Accept common casing slips — Vercel env var names are case-sensitive.
  const configured =
    process.env.AUTH_SECRET || process.env.Auth_secret || process.env.auth_secret;
  if (configured) return new TextEncoder().encode(configured);
  if (process.env.NODE_ENV === "production") {
    // Never sign production sessions with a secret that lives in a public
    // repo — anyone could forge an admin cookie. Fail loudly instead.
    throw new Error(
      "AUTH_SECRET is not set. Add it in Vercel → Settings → Environment Variables, then redeploy.",
    );
  }
  return new TextEncoder().encode("dev-secret-4440");
};

const SESSION_DAYS = 90;

export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * SESSION_DAYS,
    path: "/",
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

/**
 * Returns the logged-in user or null. Cached per request.
 *
 * Only a missing/invalid token or a deleted user counts as "logged out".
 * A database failure (e.g. serverless Postgres waking from idle) is retried
 * and, if persistent, thrown — it must never masquerade as a logout and
 * bounce a validly signed-in user to the login screen.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;

  let userId: string | undefined;
  try {
    const { payload } = await jwtVerify(token, secret());
    userId = payload.sub;
  } catch {
    return null; // expired or invalid token — genuinely signed out
  }
  if (!userId) return null;

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true, role: true },
      });
      if (!user) return null; // account removed — signed out
      return { ...user, role: user.role as UserRole };
    } catch (e) {
      lastError = e;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Database unavailable while checking the session.");
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Server-side permission gate for mutations. Throws (does not redirect) so
 * server actions fail loudly if called without authorization.
 */
export async function requireRole(role: UserRole): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user || !hasRole(user, role)) {
    throw new Error(
      role === "ADMIN"
        ? "Admin access required."
        : "You need editor access to make changes.",
    );
  }
  return user;
}
