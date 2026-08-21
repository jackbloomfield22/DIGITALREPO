"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";

const signupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(100),
});

export async function signup(formData: FormData) {
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    redirect(
      `/signup?error=${encodeURIComponent(
        issue?.path[0] === "password"
          ? "Password must be at least 8 characters."
          : "Check your name and email and try again.",
      )}`,
    );
  }
  const { name, email, password } = parsed.data;

  // Sign-up requires the team invite code. The SIGNUP_CODE env var overrides
  // the built-in default; with the default, the trailing "!" is optional.
  const requiredCode = process.env.SIGNUP_CODE || "44Forty2026!";
  const submitted = String(formData.get("code") ?? "").trim();
  const codeOk =
    submitted === requiredCode ||
    (!process.env.SIGNUP_CODE && submitted === "44Forty2026");
  if (!codeOk) {
    redirect(`/signup?error=${encodeURIComponent("That invite code isn't right.")}`);
  }

  const existing = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    redirect(
      `/signup?error=${encodeURIComponent("An account with that email already exists — sign in instead.")}`,
    );
  }

  // Everyone shares the one Digital Bible; new members join as editors so they
  // can contribute immediately. Admins can adjust roles under /admin.
  const user = await db.user.create({
    data: {
      name,
      email: email.toLowerCase(),
      role: "EDITOR",
      passwordHash: bcrypt.hashSync(password, 10),
    },
  });
  await db.auditLog.create({
    data: {
      userId: user.id,
      userName: user.name,
      targetType: "user",
      targetId: user.id,
      targetLabel: user.name,
      action: "created",
      field: "self sign-up",
    },
  });

  await createSession(user.id);
  redirect("/creators");
}
