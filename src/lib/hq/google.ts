import "server-only";

// Google Calendar and Gmail, read-only, for the owner's HQ. Built to be
// switched on later: nothing here runs until GOOGLE_CLIENT_ID and
// GOOGLE_CLIENT_SECRET are set, and the Settings page says exactly what to
// paste where. Plain fetch against Google's REST endpoints — no SDK to keep
// in step — with tokens held on the owner's HqConnection row.
//
// What the sync does: calendar events land in HqEvent under source "google";
// Gmail is read for *who you talked to*, not what was said — a message to or
// from someone in your relationships becomes an interaction on that person
// (subject line only) and moves their last-contact date. Nothing is stored
// about mail with people who are not in HQ.

import { db } from "@/lib/db";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function googleConfigured(): boolean {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
}

export function googleRedirectUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/hq/google/callback`;
}

export function googleAuthUrl(origin: string, state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: googleRedirectUri(origin),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number; scope?: string; error?: string; error_description?: string };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      ...body,
    }),
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok || json.error) throw new Error(json.error_description ?? json.error ?? `Google token request failed (${res.status})`);
  return json;
}

export async function connectGoogle(ownerId: string, code: string, origin: string): Promise<{ email: string | null }> {
  const tok = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: googleRedirectUri(origin) });
  const who: { email?: string } = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${tok.access_token}` } })
    .then((r) => (r.ok ? (r.json() as Promise<{ email?: string }>) : Promise.resolve({})))
    .catch(() => ({}));
  const existing = await db.hqConnection.findUnique({ where: { ownerId_provider: { ownerId, provider: "google" } } });
  await db.hqConnection.upsert({
    where: { ownerId_provider: { ownerId, provider: "google" } },
    update: {
      accessToken: tok.access_token,
      // Google only hands the refresh token out on the first consent; keep the one we have.
      refreshToken: tok.refresh_token ?? existing?.refreshToken ?? null,
      expiresAt: new Date(Date.now() + tok.expires_in * 1000),
      scopes: (tok.scope ?? SCOPES.join(" ")).split(" "),
      accountEmail: who.email ?? existing?.accountEmail ?? null,
      status: "connected", lastError: null,
    },
    create: {
      ownerId, provider: "google",
      accessToken: tok.access_token, refreshToken: tok.refresh_token ?? null,
      expiresAt: new Date(Date.now() + tok.expires_in * 1000),
      scopes: (tok.scope ?? SCOPES.join(" ")).split(" "),
      accountEmail: who.email ?? null, status: "connected",
    },
  });
  return { email: who.email ?? null };
}

async function accessToken(ownerId: string): Promise<string> {
  const conn = await db.hqConnection.findUnique({ where: { ownerId_provider: { ownerId, provider: "google" } } });
  if (!conn || conn.status === "disconnected" || !conn.refreshToken) throw new Error("Google is not connected.");
  if (conn.accessToken && conn.expiresAt && conn.expiresAt.getTime() - Date.now() > 60_000) return conn.accessToken;
  const tok = await tokenRequest({ refresh_token: conn.refreshToken, grant_type: "refresh_token" });
  await db.hqConnection.update({
    where: { id: conn.id },
    data: { accessToken: tok.access_token, expiresAt: new Date(Date.now() + tok.expires_in * 1000) },
  });
  return tok.access_token;
}

async function gget<T>(token: string, url: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Google API ${res.status} on ${new URL(url).pathname}`);
  return res.json() as Promise<T>;
}

type GEvent = {
  id: string; status?: string; summary?: string; location?: string; description?: string;
  start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string };
  attendees?: { email?: string; displayName?: string; self?: boolean }[];
};

/** Turn a Google event into the row HQ keeps. Exported for tests. */
export function mapGoogleEvent(e: GEvent): { externalId: string; title: string; startsAt: Date; endsAt: Date | null; allDay: boolean; location: string | null; notes: string | null; attendees: string[] } | null {
  if (e.status === "cancelled") return null;
  const startRaw = e.start?.dateTime ?? e.start?.date;
  if (!startRaw) return null;
  const allDay = !e.start?.dateTime;
  const startsAt = allDay ? new Date(startRaw + "T00:00:00") : new Date(startRaw);
  const endRaw = e.end?.dateTime ?? e.end?.date;
  const endsAt = endRaw ? (allDay ? new Date(endRaw + "T00:00:00") : new Date(endRaw)) : null;
  return {
    externalId: e.id,
    title: e.summary?.trim() || "(untitled)",
    startsAt, endsAt, allDay,
    location: e.location ?? null,
    notes: e.description ? e.description.slice(0, 4000) : null,
    attendees: (e.attendees ?? []).filter((a) => !a.self && a.email).map((a) => (a.displayName ? `${a.displayName} <${a.email}>` : a.email!)),
  };
}

export async function syncGoogleCalendar(ownerId: string): Promise<{ upserted: number; removed: number }> {
  const token = await accessToken(ownerId);
  const timeMin = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const timeMax = new Date(Date.now() + 45 * 86_400_000).toISOString();
  let pageToken: string | undefined;
  let upserted = 0;
  const seen = new Set<string>();
  do {
    const p = new URLSearchParams({ singleEvents: "true", orderBy: "startTime", timeMin, timeMax, maxResults: "250", showDeleted: "true" });
    if (pageToken) p.set("pageToken", pageToken);
    const page = await gget<{ items?: GEvent[]; nextPageToken?: string }>(token, `https://www.googleapis.com/calendar/v3/calendars/primary/events?${p}`);
    for (const e of page.items ?? []) {
      const row = mapGoogleEvent(e);
      if (!row) {
        await db.hqEvent.deleteMany({ where: { ownerId, source: "google", externalId: e.id } });
        continue;
      }
      seen.add(row.externalId);
      await db.hqEvent.upsert({
        where: { ownerId_source_externalId: { ownerId, source: "google", externalId: row.externalId } },
        update: { ...row, calendarId: "primary" },
        create: { ownerId, source: "google", calendarId: "primary", ...row },
      });
      upserted++;
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  // Anything Google no longer returns in the window is gone from the calendar.
  const removed = await db.hqEvent.deleteMany({
    where: { ownerId, source: "google", startsAt: { gte: new Date(timeMin), lte: new Date(timeMax) }, externalId: { notIn: [...seen] } },
  });
  return { upserted, removed: removed.count };
}

type GMessage = { id: string; internalDate?: string; payload?: { headers?: { name: string; value: string }[] } };

const emailsIn = (v: string | undefined): string[] => (v ? [...v.matchAll(/[\w.+-]+@[\w-]+\.[\w.-]+/g)].map((m) => m[0].toLowerCase()) : []);

/** Decide which relationship a message belongs to, from its From/To/Cc. Exported for tests. */
export function matchMessage(
  headers: Record<string, string>,
  byEmail: Map<string, string>,
  ownEmail: string | null,
): { relationshipId: string; kind: "email"; summary: string; at: Date } | null {
  const others = [...emailsIn(headers.from), ...emailsIn(headers.to), ...emailsIn(headers.cc)].filter((e) => e !== ownEmail?.toLowerCase());
  const hit = others.find((e) => byEmail.has(e));
  if (!hit) return null;
  const at = headers.date ? new Date(headers.date) : new Date();
  const outgoing = ownEmail && emailsIn(headers.from).includes(ownEmail.toLowerCase());
  return {
    relationshipId: byEmail.get(hit)!,
    kind: "email",
    summary: `${outgoing ? "Sent" : "Received"}: ${headers.subject?.trim() || "(no subject)"}`,
    at: isNaN(at.getTime()) ? new Date() : at,
  };
}

export async function syncGmail(ownerId: string): Promise<{ scanned: number; matched: number }> {
  const token = await accessToken(ownerId);
  const conn = await db.hqConnection.findUnique({ where: { ownerId_provider: { ownerId, provider: "google" } } });
  const rels = await db.hqRelationship.findMany({ where: { ownerId, email: { not: null } }, select: { id: true, email: true } });
  const byEmail = new Map(rels.map((r) => [r.email!.toLowerCase(), r.id]));
  if (!byEmail.size) return { scanned: 0, matched: 0 };

  const since = conn?.lastSyncAt ? Math.floor(conn.lastSyncAt.getTime() / 1000) - 3600 : Math.floor((Date.now() - 30 * 86_400_000) / 1000);
  const list = await gget<{ messages?: { id: string }[] }>(token, `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(`after:${since} -category:promotions`)}&maxResults=200`);
  let matched = 0;
  const ids = (list.messages ?? []).map((m) => m.id);
  for (const id of ids) {
    const msg = await gget<GMessage>(token, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date`);
    const headers: Record<string, string> = {};
    for (const h of msg.payload?.headers ?? []) headers[h.name.toLowerCase()] = h.value;
    const hit = matchMessage(headers, byEmail, conn?.accountEmail ?? null);
    if (!hit) continue;
    const at = msg.internalDate ? new Date(Number(msg.internalDate)) : hit.at;
    await db.hqInteraction.upsert({
      where: { ownerId_source_externalId: { ownerId, source: "google", externalId: msg.id } },
      update: {},
      create: { ownerId, relationshipId: hit.relationshipId, at, kind: "email", summary: hit.summary, source: "google", externalId: msg.id },
    });
    const rel = await db.hqRelationship.findUnique({ where: { id: hit.relationshipId }, select: { lastContactAt: true } });
    if (!rel?.lastContactAt || rel.lastContactAt < at) await db.hqRelationship.update({ where: { id: hit.relationshipId }, data: { lastContactAt: at } });
    matched++;
  }
  return { scanned: ids.length, matched };
}

export async function runGoogleSync(ownerId: string): Promise<{ ok: boolean; summary: string }> {
  try {
    const cal = await syncGoogleCalendar(ownerId);
    const mail = await syncGmail(ownerId);
    await db.hqConnection.update({
      where: { ownerId_provider: { ownerId, provider: "google" } },
      data: { lastSyncAt: new Date(), status: "connected", lastError: null },
    });
    return { ok: true, summary: `${cal.upserted} calendar events, ${mail.matched} emails matched to people (${mail.scanned} scanned)` };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed";
    await db.hqConnection.updateMany({ where: { ownerId, provider: "google" }, data: { status: "error", lastError: message } });
    return { ok: false, summary: message };
  }
}

export async function disconnectGoogle(ownerId: string): Promise<void> {
  const conn = await db.hqConnection.findUnique({ where: { ownerId_provider: { ownerId, provider: "google" } } });
  if (conn?.refreshToken) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(conn.refreshToken)}`, { method: "POST" }).catch(() => {});
  }
  await db.hqConnection.updateMany({
    where: { ownerId, provider: "google" },
    data: { status: "disconnected", accessToken: null, refreshToken: null, expiresAt: null },
  });
  await db.hqEvent.deleteMany({ where: { ownerId, source: "google" } });
}
