// Decrypt an offsite backup downloaded from Vercel Blob back into plain JSON
// usable by scripts/restore-backup.mjs.
//
//   AUTH_SECRET="..." node scripts/decrypt-backup.mjs repo-backup-....enc backup.json
//
// The AUTH_SECRET must be the one the deployment used when the backup was
// uploaded (Vercel → Settings → Environment Variables).

import { readFileSync, writeFileSync } from "node:fs";
import crypto from "node:crypto";

const [input, output] = process.argv.slice(2);
const secret = process.env.AUTH_SECRET;
if (!input || !output || !secret) {
  console.error('Usage: AUTH_SECRET="..." node scripts/decrypt-backup.mjs <input.enc> <output.json>');
  process.exit(1);
}

const payload = readFileSync(input);
if (payload.subarray(0, 5).toString() !== "44RB1") {
  console.error("Not a 4.4.Forty Repo encrypted backup (bad header).");
  process.exit(1);
}
const iv = payload.subarray(5, 17);
const tag = payload.subarray(17, 33);
const ciphertext = payload.subarray(33);

const key = crypto.createHash("sha256").update(secret).digest();
const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
decipher.setAuthTag(tag);
try {
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  writeFileSync(output, plain);
  console.log(`Decrypted ${plain.byteLength} bytes → ${output}`);
} catch {
  console.error("Decryption failed — wrong AUTH_SECRET or corrupted file.");
  process.exit(1);
}
