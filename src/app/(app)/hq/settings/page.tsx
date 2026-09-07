import { headers } from "next/headers";
import { db } from "@/lib/db";
import { requireOwner, OWNER_EMAIL } from "@/lib/hq/owner";
import { HqFrame } from "@/components/hq/nav";
import { AiSettings, GoogleSettings, SeedAndData } from "@/components/hq/settings";
import { googleConfigured } from "@/lib/hq/google";
import { askAvailable, spendThisMonth, spendToday } from "@/lib/hq/ask";

export const metadata = { title: "HQ · Settings" };
export const dynamic = "force-dynamic";

const NOTICES: Record<string, string> = {
  connected: "Google connected and synced.",
  denied: "Google access was declined.",
  state: "That sign-in didn't match this browser session. Try again.",
  unconfigured: "Google credentials are not set on the site yet.",
  error: "Google connection failed.",
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ google?: string; message?: string }> }) {
  const user = await requireOwner();
  const { google, message } = await searchParams;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "your-site"}`;
  const [settings, conn, today, month, pipelines, relationships, ideas, notes] = await Promise.all([
    db.hqSettings.findUnique({ where: { ownerId: user.id } }),
    db.hqConnection.findUnique({ where: { ownerId_provider: { ownerId: user.id, provider: "google" } } }),
    spendToday(user.id), spendThisMonth(user.id),
    db.hqPipeline.count({ where: { ownerId: user.id } }), db.hqRelationship.count({ where: { ownerId: user.id } }),
    db.hqIdea.count({ where: { ownerId: user.id } }), db.hqNote.count({ where: { ownerId: user.id } }),
  ]);
  const links = await db.hqMention.count({ where: { ownerId: user.id } });
  const notice = google ? `${NOTICES[google] ?? ""}${message ? ` ${message}` : ""}` : undefined;

  return (
    <HqFrame active="/hq/settings">
      <div className="mb-3">
        <h1 className="font-display text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted">HQ belongs to {OWNER_EMAIL}. Nobody else on the site can open it, and its data stays out of the shared backups.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-4"><div className="overline mb-2">Your data</div><SeedAndData seededAt={settings?.seededAt?.toISOString() ?? null} counts={{ pipelines, relationships, ideas, notes, links }} /></section>
        <section className="card p-4"><div className="overline mb-2">Google Calendar &amp; Gmail</div><GoogleSettings configured={googleConfigured()} status={conn?.status ?? null} email={conn?.accountEmail ?? null} lastSyncAt={conn?.lastSyncAt?.toISOString() ?? null} lastError={conn?.lastError ?? null} notice={notice} origin={origin} /></section>
        <section className="card p-4"><div className="overline mb-2">AI</div><AiSettings aiEnabled={!!settings?.aiEnabled} capCents={settings?.aiDailyCapCents ?? 200} keyPresent={askAvailable()} spentToday={today} spentMonth={month} /></section>
        <section className="card p-4">
          <div className="overline mb-2">How the pieces fit</div>
          <ul className="space-y-1.5 text-sm text-muted">
            <li><b className="text-charcoal">Today</b> works out what matters from everything else: overdue and due follow-ups, cards with no next step or no recent contact, people going cold, meetings to prep for, and three ideas to look at again.</li>
            <li><b className="text-charcoal">The capture bar</b> on every HQ page reads a line and files it — task, follow-up, event, idea or note — and links @people and #cards.</li>
            <li><b className="text-charcoal">Pipeline</b> cards sit on top of Repo records where one exists; the Repo page stays the shared truth, the card holds what&rsquo;s private: why it matters, next step, who decides.</li>
            <li><b className="text-charcoal">People</b> are Repo people with a private layer: circle, cadence, interests, conversations. Finishing a follow-up logs contact; Gmail sync does the same automatically.</li>
            <li><b className="text-charcoal">Brain</b> searches your notes, ideas, conversations and the whole Repo together, and reads a question for what kind of answer you want.</li>
            <li><b className="text-charcoal">The network</b> forms itself: any name in anything you write links to the person, card or record, and every page shows what mentions it. Strength and momentum scores read those links along with recency and frequency.</li>
            <li><b className="text-charcoal">Loops</b>: “waiting on…” marks the ball in their court and nudges after five days; a meeting linked to a person or card gets a prep sheet before and a one-box debrief after; the weekly review shows what moved and what stalled, with push/park/drop.</li>
            <li><b className="text-charcoal">Studio</b> turns your style guide, examples and a card&rsquo;s facts into a brief for Claude — or a draft here, if AI is on.</li>
          </ul>
        </section>
      </div>
    </HqFrame>
  );
}
