import { db } from "@/lib/db";
import { requireOwner } from "@/lib/hq/owner";
import { HqFrame } from "@/components/hq/nav";
import { BriefBuilder, ExamplesLibrary, StyleGuideEditor } from "@/components/hq/studio";
import { DEFAULT_STYLE_GUIDE, OUTPUTS } from "@/lib/hq/studio";
import { askAvailable } from "@/lib/hq/ask";

export const metadata = { title: "HQ · Studio" };
export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const user = await requireOwner();
  const [settings, examples] = await Promise.all([
    db.hqSettings.findUnique({ where: { ownerId: user.id } }),
    db.hqStyleExample.findMany({ where: { ownerId: user.id }, orderBy: { createdAt: "desc" } }),
  ]);
  const aiOn = !!settings?.aiEnabled && askAvailable();
  return (
    <HqFrame active="/hq/studio">
      <div className="mb-3">
        <h1 className="font-display text-2xl font-bold tracking-tight">Studio</h1>
        <p className="max-w-3xl text-sm text-muted">
          Decks, loglines, talent summaries, executive emails — the materials you write over and over. The Studio holds how you write them and the ones you&rsquo;d
          hold up as examples, and turns that plus everything HQ knows about a project into a brief a writer can work from. Paste the brief to Claude, or, with
          AI switched on in Settings, draft it here.
        </p>
      </div>

      <section className="card mb-6 p-4">
        <div className="overline mb-2">Write something</div>
        <BriefBuilder outputs={OUTPUTS.map((o) => ({ value: o.value, label: o.label }))} aiOn={aiOn} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-4">
          <div className="mb-1 flex items-baseline justify-between"><span className="overline">Style guide</span><span className="text-xs text-faint">saves as you type</span></div>
          <p className="mb-2 text-xs text-muted">How you structure a deck, what a logline has to do, how an exec email opens. Edit it in your own words; the writer follows it.</p>
          <StyleGuideEditor value={settings?.styleGuide ?? DEFAULT_STYLE_GUIDE} />
        </section>
        <section className="card p-4">
          <div className="overline mb-2">Examples library</div>
          <ExamplesLibrary examples={examples.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() }))} />
        </section>
      </div>
    </HqFrame>
  );
}
