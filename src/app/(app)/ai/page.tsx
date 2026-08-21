import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { aiAvailable } from "@/lib/ai/agent";
import { AiChat, type ChatMessage } from "@/components/ai-chat";
import type { ResultCard } from "@/lib/ai/tools";

export const metadata = { title: "AI Search" };

export default async function AiSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string }>;
}) {
  const user = await requireUser();
  const { thread: threadParam } = await searchParams;

  const threads = await db.aiThread.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  let initialMessages: ChatMessage[] = [];
  let threadId: string | null = null;
  if (threadParam) {
    const thread = threads.find((t) => t.id === threadParam);
    if (thread) {
      threadId = thread.id;
      const messages = await db.aiMessage.findMany({
        where: { threadId: thread.id },
        orderBy: { createdAt: "asc" },
      });
      initialMessages = messages.map((m) => ({
        role: m.role as "user" | "assistant",
        text: m.content,
        cards: (m.results as ResultCard[] | null) ?? [],
      }));
    }
  }

  return (
    <AiChat
      available={aiAvailable()}
      threads={threads.map((t) => ({ id: t.id, title: t.title ?? "Untitled" }))}
      initialThreadId={threadId}
      initialMessages={initialMessages}
    />
  );
}
