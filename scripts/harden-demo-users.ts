// One-shot production hardening, run on every hosted build (idempotent).
//
// The demo accounts were originally seeded with well-known passwords that are
// visible in this public repo. If any of those passwords still work, rotate
// them to random ones. The rotated admin password is printed once in the
// build log; the editor/viewer demo accounts are simply locked.
//
// Optionally, ADMIN_EMAIL promotes a real account to ADMIN so the team's own
// login (created via sign-up, which grants EDITOR) can manage everything and
// the demo admin account is no longer needed.

import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const DEFAULTS: Record<string, string> = {
  "admin@440.media": "admin440",
  "editor@440.media": "editor440",
  "viewer@440.media": "viewer440",
};

async function main() {
  for (const [email, defaultPw] of Object.entries(DEFAULTS)) {
    const user = await db.user.findUnique({ where: { email } });
    if (!user || !bcrypt.compareSync(defaultPw, user.passwordHash)) continue;
    const fresh = crypto.randomBytes(12).toString("base64url");
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: bcrypt.hashSync(fresh, 10) },
    });
    if (email === "admin@440.media") {
      console.log("──────────────────────────────────────────────────────────");
      console.log(`  Demo admin password was still the public default — rotated.`);
      console.log(`  New password for ${email}: ${fresh}`);
      console.log("  Save it now — it is only printed once, in this build log.");
      console.log("──────────────────────────────────────────────────────────");
    } else {
      console.log(`Locked demo account ${email} (had the public default password).`);
    }
  }

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (adminEmail) {
    const user = await db.user.findUnique({ where: { email: adminEmail } });
    if (user && user.role !== "ADMIN") {
      await db.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
      console.log(`Promoted ${adminEmail} to ADMIN (via ADMIN_EMAIL).`);
    }
  }
}

main()
  .catch((e) => {
    // Never fail the build over hardening — surface it and move on.
    console.error("harden-demo-users failed:", e);
  })
  .finally(() => db.$disconnect());
