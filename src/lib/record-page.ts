// What every record page needs beyond its own row: whether the viewer has
// starred it, whether it looks like a duplicate, and where it went if it
// was merged away.

import { db } from "@/lib/db";
import { mergedInto, possibleDuplicates, type Duplicate, type MergedInto } from "@/lib/merge-records";

export type RecordChrome = { favorited: boolean; duplicates: Duplicate[]; merged: MergedInto | null };

export async function recordChrome(userId: string, type: string, id: string, name: string, archived: boolean): Promise<RecordChrome> {
  const [fav, duplicates, merged] = await Promise.all([
    db.favorite.findUnique({ where: { userId_targetType_targetId: { userId, targetType: type, targetId: id } }, select: { id: true } }),
    archived ? Promise.resolve([]) : possibleDuplicates(type, id, name),
    archived ? mergedInto(type, id) : Promise.resolve(null),
  ]);
  return { favorited: !!fav, duplicates, merged };
}

export type RecordSearchParams = Promise<{ tab?: string; link?: string }>;
