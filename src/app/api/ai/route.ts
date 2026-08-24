import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { aiAvailable, runAiSearch } from "@/lib/ai/agent";
import { ResultRegistry, toolByName } from "@/lib/ai/tools";

const bodySchema = z.object({
  threadId: z.string().max(50).nullish(),
  message: z.string().min(1).max(4000),
});

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Load or create thread
  let threadId = body.threadId ?? null;
  if (threadId) {
    const thread = await db.aiThread.findFirst({ where: { id: threadId, userId: user.id } });
    if (!thread) threadId = null;
  }
  if (!threadId) {
    const thread = await db.aiThread.create({
      data: { userId: user.id, title: body.message.slice(0, 80) },
    });
    threadId = thread.id;
  }

  await db.aiMessage.create({
    data: { threadId, role: "user", content: body.message },
  });

  const history = await db.aiMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
    take: 30,
  });

  let text: string;
  let cards: unknown[] = [];
  let degraded = false;

  if (aiAvailable()) {
    try {
      const result = await runAiSearch(
        history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      );
      text = result.text;
      cards = result.cards;
    } catch (e) {
      console.error("AI search failed:", e);
      const fallback = await keywordFallback(body.message);
      text = `The AI service returned an error, so here are direct keyword matches from the database instead.`;
      cards = fallback;
      degraded = true;
    }
  } else {
    const fallback = await keywordFallback(body.message);
    text =
      fallback.length > 0
        ? "AI search isn't configured (no ANTHROPIC_API_KEY), so here are direct keyword matches from the database. Structured browsing, filters, and Explore remain fully available."
        : "AI search isn't configured (no ANTHROPIC_API_KEY), and no keyword matches were found. Try the directory filters or Explore.";
    cards = fallback;
    degraded = true;
  }

  await db.aiMessage.create({
    data: { threadId, role: "assistant", content: text, results: cards as object[] },
  });

  return NextResponse.json({ threadId, text, cards, degraded });
}

/** Structured keyword search used when the AI API is unavailable. */
async function keywordFallback(message: string) {
  const registry = new ResultRegistry();
  const stop = new Set(["which", "who", "what", "where", "creators", "creator", "the", "are", "with", "have", "has", "and", "for", "that", "in", "a", "an", "of", "to", "is", "worked", "interested", "live", "lives", "find", "show", "me", "list"]);
  const terms = message
    .replace(/[?.,!]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !stop.has(t.toLowerCase()));

  const searchCreators = toolByName("search_creators");
  const searchEntities = toolByName("search_entities");
  for (const term of terms.slice(0, 5)) {
    try {
      await searchCreators?.run({ query: term, limit: 4 } as never, registry);
      const entities = (await searchEntities?.run({ query: term } as never, registry)) as
        | { name: string; kind: string; creatorCount: number }[]
        | undefined;
      const strong = entities?.filter((e) => e.creatorCount > 0)?.slice(0, 2) ?? [];
      for (const e of strong) {
        await searchCreators?.run({ entityNames: [e.name], limit: 6 } as never, registry);
      }
      const orgSearch = toolByName("search_organizations");
      await orgSearch?.run({ query: term, limit: 3 } as never, registry);
    } catch {
      // best effort
    }
  }
  return [...registry.cards.values()].slice(0, 12);
}
