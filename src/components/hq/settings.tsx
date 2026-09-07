"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { googleDisconnect, googleSyncNow, importBrain, rebuildConnections, saveHqSettings, seedHq } from "@/lib/actions/hq";

export function AiSettings({ aiEnabled, capCents, keyPresent, spentToday, spentMonth }: { aiEnabled: boolean; capCents: number; keyPresent: boolean; spentToday: number; spentMonth: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [cap, setCap] = useState(String((capCents / 100).toFixed(2)));
  return (
    <div className="space-y-3 text-sm">
      <label className="flex items-start gap-2">
        <input type="checkbox" className="mt-1 !w-auto" checked={aiEnabled} disabled={pending || !keyPresent} onChange={(e) => start(async () => { await saveHqSettings({ aiEnabled: e.target.checked }); router.refresh(); })} />
        <span>
          <span className="font-medium">AI in HQ</span> — “Ask the brain” on the Brain page and “Draft here” in the Studio.
          <span className="block text-xs text-muted">{keyPresent ? "Off by default. Everything else in HQ works without it; these two read the live brain, which a chat outside the site cannot." : "No ANTHROPIC_API_KEY on the site, so this stays off."}</span>
        </span>
      </label>
      <div className="flex items-center gap-2">
        <span>Daily cap $</span>
        <input value={cap} onChange={(e) => setCap(e.target.value)} onBlur={() => start(async () => { const n = Math.round(Number(cap) * 100); if (!isNaN(n)) { await saveHqSettings({ aiDailyCapCents: Math.max(0, n) }); router.refresh(); } })} className="!w-24 text-sm" />
        <span className="text-xs text-faint">0 = no cap</span>
      </div>
      <div className="text-xs text-muted">Spent today ${(spentToday / 100).toFixed(2)} · this month ${(spentMonth / 100).toFixed(2)}. Estimates from token counts; the invoice is the truth.</div>
    </div>
  );
}

export function GoogleSettings({ configured, status, email, lastSyncAt, lastError, notice, origin }: { configured: boolean; status: string | null; email: string | null; lastSyncAt: string | null; lastError: string | null; notice?: string; origin: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(notice ?? null);
  const connected = status === "connected" || status === "error";
  return (
    <div className="space-y-3 text-sm">
      {msg && <div className="rounded bg-wash px-3 py-2 text-xs">{msg}</div>}
      {connected ? (
        <>
          <div>Connected as <span className="font-medium">{email ?? "Google account"}</span>{lastSyncAt ? ` · last sync ${new Date(lastSyncAt).toLocaleString()}` : ""}{status === "error" && <span className="text-[#8a3a30]"> · last sync failed: {lastError}</span>}</div>
          <div className="flex gap-2">
            <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => start(async () => { const r = await googleSyncNow(); setMsg(r.ok ? `Synced: ${r.summary}` : r.error); router.refresh(); })}>Sync now</button>
            <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => { if (confirm("Disconnect Google? Synced events are removed; logged conversations stay.")) start(async () => { await googleDisconnect(); router.refresh(); }); }}>Disconnect</button>
          </div>
          <p className="text-xs text-muted">Calendar: the next 45 days and the past week, refreshed on each sync. Gmail: mail to or from anyone in your People with an email on file becomes a logged conversation (subject only) and moves their last-contact date. Nothing else from your mail is stored.</p>
        </>
      ) : configured ? (
        <>
          <a href="/api/hq/google/start" className="btn btn-primary btn-sm">Connect Google</a>
          <p className="text-xs text-muted">Read-only access to your primary calendar and Gmail metadata. You can disconnect here any time; disconnecting revokes the token.</p>
        </>
      ) : (
        <>
          <div className="text-muted">Not configured yet. The sync is built; it needs two values from Google to switch on.</div>
          <ol className="list-decimal space-y-1 pl-5 text-xs text-muted">
            <li>Google Cloud Console → create a project → APIs &amp; Services → enable <b>Google Calendar API</b> and <b>Gmail API</b>.</li>
            <li>OAuth consent screen → External → add your Gmail address as a test user. Scopes: calendar.readonly, gmail.readonly, userinfo.email.</li>
            <li>Credentials → Create OAuth client ID → Web application → Authorized redirect URI: <code className="rounded bg-wash px-1">{origin}/api/hq/google/callback</code></li>
            <li>In Vercel → Project → Settings → Environment Variables add <code className="rounded bg-wash px-1">GOOGLE_CLIENT_ID</code> and <code className="rounded bg-wash px-1">GOOGLE_CLIENT_SECRET</code>, then redeploy.</li>
            <li>Come back here and press Connect Google.</li>
          </ol>
        </>
      )}
    </div>
  );
}

export function SeedAndData({ seededAt, counts }: { seededAt: string | null; counts: { pipelines: number; relationships: number; ideas: number; notes: number; links: number } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="space-y-4 text-sm">
      <div>
        <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => start(async () => { const r = await seedHq(); setMsg(r.ok ? `Seeded: ${r.pipelines} pipeline cards, ${r.relationships} people, ${r.contacts} card contacts added.` : r.error); router.refresh(); })}>
          {pending ? "Seeding…" : seededAt ? "Seed again (adds what's new)" : "Seed from the Repo"}
        </button>
        <p className="mt-1 text-xs text-muted">Every live format, channel, production and opportunity becomes a pipeline card at the matching stage with its talent and people attached; every industry person and talent becomes a relationship. Only creates what is missing — nothing you&rsquo;ve written is touched.{seededAt ? ` Last seeded ${new Date(seededAt).toLocaleString()}.` : ""}</p>
        {msg && <div className="mt-1 text-xs">{msg}</div>}
      </div>
      <div>
        <label className="btn btn-secondary btn-sm cursor-pointer">
          Import a brain bundle
          <input type="file" accept=".json" className="hidden" onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
            const r = await importBrain(await f.text());
            setMsg(r.ok ? `Imported: ${r.summary}.${r.unresolved.length ? ` Not found in the Repo: ${r.unresolved.slice(0, 8).join(", ")}${r.unresolved.length > 8 ? "…" : ""}` : ""}` : r.error);
            router.refresh();
          }} />
        </label>
        <p className="mt-1 text-xs text-muted">A .json of ideas, notes, people, conversations, cards and tasks prepared outside the site (kind “44forty-brain”). Names resolve against your People and the Repo.</p>
      </div>
      <div>
        <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => start(async () => { const r = await rebuildConnections(); setMsg(r.ok ? `Connections rebuilt: ${r.links} links between your notes, people, cards and the Repo.` : r.error); router.refresh(); })}>Rebuild connections</button>
        <p className="mt-1 text-xs text-muted">Every name in every note, idea, conversation, card and task links to the person, card or Repo record it names, in both directions. This rebuilds the whole graph; it also happens after a seed or an import. Currently {counts.links.toLocaleString()} links.</p>
      </div>
      <div>
        <a href="/api/hq/export" className="btn btn-secondary btn-sm">Export my HQ</a>
        <p className="mt-1 text-xs text-muted">Everything in HQ as one JSON file. HQ is left out of the shared site backups on purpose; this is your copy. Currently {counts.pipelines} cards · {counts.relationships} people · {counts.ideas} ideas · {counts.notes} notes.</p>
      </div>
    </div>
  );
}
