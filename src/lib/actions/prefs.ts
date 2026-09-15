"use server";

import { requireUser } from "@/lib/auth";
import { readPrefs, writePrefs, type UserPrefs } from "@/lib/prefs";

export async function savePrefs(patch: UserPrefs): Promise<UserPrefs> {
  const user = await requireUser();
  return writePrefs(user.id, patch);
}

export async function loadPrefs(): Promise<UserPrefs> {
  const user = await requireUser();
  return readPrefs(user.id);
}
