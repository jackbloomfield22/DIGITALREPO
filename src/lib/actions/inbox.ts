"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { aiAvailable } from "@/lib/ai/agent";
import { applyProposal, parseResearchText, proposalSchema } from "@/lib/ai/inbox";
import { logAudit } from "@/lib/audit";

export async function submitInboxItem(rawText: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const user = await requireRole("EDITOR");
    const text = rawText.trim();
    if (!text) return { ok: false, error: "Paste some research first." };
    const item = await db.researchInboxItem.create({
      data: { rawText: text.slice(0, 20_000), createdById: user.id },
    });
    revalidatePath("/inbox");
    return { ok: true, id: item.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save." };
  }
}

export async function proposeInboxItem(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireRole("EDITOR");
    if (!aiAvailable()) {
      return { ok: false, error: "AI parsing needs ANTHROPIC_API_KEY. The note is saved — you can still apply the facts manually from the record pages." };
    }
    const item = await db.researchInboxItem.findUnique({ where: { id } });
    if (!item) return { ok: false, error: "Item not found." };
    const proposal = await parseResearchText(item.rawText);
    await db.researchInboxItem.update({
      where: { id },
      data: { status: "proposed", proposal },
    });
    revalidatePath("/inbox");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? `AI parsing failed: ${e.message}` : "AI parsing failed." };
  }
}

export async function applyInboxItem(id: string): Promise<{
  ok: boolean;
  error?: string;
  applied?: string[];
  created?: string[];
  skipped?: string[];
}> {
  try {
    const user = await requireRole("EDITOR");
    const item = await db.researchInboxItem.findUnique({ where: { id } });
    if (!item || !item.proposal) return { ok: false, error: "No proposal to apply." };
    const proposal = proposalSchema.parse(item.proposal);
    const result = await applyProposal(proposal, user);
    await db.researchInboxItem.update({ where: { id }, data: { status: "applied" } });
    await logAudit(user, {
      targetType: "collection",
      targetId: id,
      targetLabel: "Research Inbox item",
      action: "updated",
      field: "applied",
      newValue: `${result.applied.length} links, ${result.created.length} new records`,
    });
    revalidatePath("/", "layout");
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Apply failed." };
  }
}

export async function dismissInboxItem(id: string): Promise<{ ok: boolean }> {
  await requireRole("EDITOR");
  await db.researchInboxItem.update({ where: { id }, data: { status: "dismissed" } });
  revalidatePath("/inbox");
  return { ok: true };
}
