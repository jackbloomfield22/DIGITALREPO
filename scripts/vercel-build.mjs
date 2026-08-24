// Vercel build entrypoint: resolves the database URL across marketplace
// integrations (Neon, Supabase, Vercel/Prisma Postgres all inject different
// env var names), runs migrations, bootstrap-seeds an empty database, then
// builds. Fails with actionable guidance when no database is connected yet.

import { execSync } from "node:child_process";

const url =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_POSTGRES_URL;

if (!url) {
  console.error(`
──────────────────────────────────────────────────────────────────────
  4.4.FORTY DIGITAL BIBLE — no database connected yet.

  Fix (about 2 minutes):
    1. In this Vercel project, open the Storage tab.
    2. Create Database → Neon (Postgres) → accept defaults → Connect.
       (Supabase or Prisma Postgres work too.)
    3. Redeploy this deployment. Migrations and demo data run themselves.

  Also make sure AUTH_SECRET is set in Environment Variables.
──────────────────────────────────────────────────────────────────────
`);
  process.exit(1);
}

const directUrl =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_POSTGRES_URL_NON_POOLING ||
  url;

const env = {
  ...process.env,
  DATABASE_URL: url,
  DATABASE_URL_UNPOOLED: directUrl,
  SEED_IF_EMPTY: "1",
};

const run = (cmd) => {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: "inherit", env });
};

if (!process.env.AUTH_SECRET && !process.env.Auth_secret && !process.env.auth_secret) {
  console.warn(`
⚠  AUTH_SECRET is not set — sign-in will fail on this deployment.
   Add AUTH_SECRET in Vercel → Settings → Environment Variables.
`);
}
if (!process.env.SIGNUP_CODE) {
  console.warn(`
⚠  SIGNUP_CODE is not set — sign-ups are closed on this deployment.
   Add SIGNUP_CODE in Vercel → Settings → Environment Variables to open
   invite-code sign-up. (This repo is public: the code must live in an
   env var, not in the source.)
`);
}
run("npx prisma migrate deploy");
run("npx tsx prisma/seed.ts");
run("npx tsx scripts/harden-demo-users.ts");
run("npx tsx scripts/rebuild-digests.ts --if-empty");
run("npx next build");
