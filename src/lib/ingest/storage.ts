// Raw-byte storage for ingested files. Currently Postgres-backed (Bytes
// column) with a size cap; this is the single seam to swap for Supabase
// Storage or Vercel Blob later — nothing else knows where bytes live.

import { db } from "@/lib/db";

export const RAW_CAP_BYTES =
  (Number(process.env.INGEST_RAW_CAP_MB) > 0 ? Number(process.env.INGEST_RAW_CAP_MB) : 4) *
  1024 * 1024;

/** Store raw bytes on an item if under the cap; returns whether retained. */
export async function storeRawBytes(itemId: string, bytes: Uint8Array): Promise<boolean> {
  if (bytes.byteLength > RAW_CAP_BYTES) {
    await db.ingestItem.update({
      where: { id: itemId },
      data: { rawRetained: false },
    });
    return false;
  }
  await db.ingestItem.update({
    where: { id: itemId },
    data: { raw: Buffer.from(bytes), rawRetained: true },
  });
  return true;
}

export async function readRawBytes(itemId: string): Promise<Uint8Array | null> {
  const item = await db.ingestItem.findUnique({
    where: { id: itemId },
    select: { raw: true, rawRetained: true },
  });
  if (!item?.rawRetained || !item.raw) return null;
  return new Uint8Array(item.raw);
}
