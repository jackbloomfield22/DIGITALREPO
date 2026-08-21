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
const secret = () =>
  new TextEncoder().encode(process.env.AUTH_SECRET ?? "dev-secret-4440");

export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

/** Returns the logged-in user or null. Cached per request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    const user = await db.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, role: true },
    });
    if (!user) return null;
    return { ...user, role: user.role as UserRole };
  } catch {
    return null;
  }
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
