// A short-lived, signed link to one attachment that needs no login. Airtable
// pulls files larger than its direct-upload limit from a URL, and it is not
// logged in to the Repo; this is the only way in without a session, and it
// expires within the hour. The signature covers the attachment id and the
// expiry, so a link cannot be edited to reach a different file or live longer.

import "server-only";
import crypto from "crypto";
import { siteOrigin } from "@/lib/airtable/config";

const TTL_MS = 45 * 60 * 1000;

function secret(): string {
  const s = process.env.AUTH_SECRET || process.env.Auth_secret || process.env.auth_secret || process.env.AIRTABLE_TOKEN;
  if (!s) throw new Error("AUTH_SECRET is required to sign file links.");
  return s;
}

function sign(id: string, exp: number): string {
  return crypto.createHmac("sha256", secret()).update(`${id}:${exp}`).digest("hex");
}

export function signedFetchUrl(attachmentId: string, now = Date.now()): string {
  const exp = now + TTL_MS;
  return `${siteOrigin()}/api/attachments/${attachmentId}/fetch?exp=${exp}&sig=${sign(attachmentId, exp)}`;
}

export function verifyFetchSignature(attachmentId: string, exp: string | null, sig: string | null, now = Date.now()): boolean {
  const expiry = Number(exp);
  if (!sig || !Number.isFinite(expiry) || expiry < now) return false;
  const expected = sign(attachmentId, expiry);
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}
