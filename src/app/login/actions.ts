"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) redirect("/login?error=credentials");

  const ip = await clientIp();
  if (!rateLimit(`login:${ip}`, 20, 15 * 60_000) || !rateLimit(`login:${ip}:${email}`, 8, 15 * 60_000)) {
    redirect("/login?error=rate");
  }

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    redirect("/login?error=credentials");
  }
  await createSession(user.id);
  redirect("/");
}
