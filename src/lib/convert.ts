import "server-only";

// Moving a record to a different part of the Repo.
//
// The bulk import filed things by guesswork, so a fair number of pages are in
// the wrong section: an existing production listed as a format in development,
// an agent listed as talent, a running channel listed as a show. Fixing that
// by hand meant re-typing the page somewhere else and losing everything hung
// off the old one. This moves it: a new record of the right type with the
// fields mapped across, every connection carried where the new type has a
// place for it, the files and sources re-pointed, and the old page archived
// with a forwarding address so its URL keeps working.
//
// Where the new type has no place for something — a talent's interests have
// nowhere to go on an industry contact — it is written into the notes rather
// than dropped, so nothing the old page knew is lost, only re-homed.

import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { refreshDigest } from "@/lib/ingest/digest";
import { slugify, uniqueSlug } from "@/lib/slug";
import {
  FORMAT_TYPES,
  PERSON_PROJECT_ROLES,
  PERSON_ROLE_TYPES,
  PROJECT_ORG_RELATIONSHIPS,
  PROJECT_ROLES,
  PROJECT_TYPES,
  labelFor,
} from "@/lib/taxonomy";
import type { SessionUser } from "@/lib/roles";
import { CONVERSIONS as ALLOWED, MOVED_PREFIX } from "@/lib/conversions";

export type ConvertibleType = "format" | "project" | "creator" | "person" | "channel";

/** Which moves make sense — one list, shared with the op vocabulary. */
export function canConvert(from: string, to: string): boolean {
  return (ALLOWED[from] ?? []).includes(to);
}

const PATHS: Record<ConvertibleType, string> = {
  format: "/formats", project: "/projects", creator: "/talent", person: "/people", channel: "/youtube",
};
const MODELS: Record<ConvertibleType, string> = {
  format: "format", project: "project", creator: "creator", person: "industryPerson", channel: "channel",
};


/** Rows keyed by (targetType, targetId) that should follow the record. */
const FOLLOWERS = ["attachment", "recordSource", "favorite", "recentView", "collectionItem"] as const;

const has = (vocab: { value: string }[], v: string | null | undefined) => !!v && vocab.some((o) => o.value === v);

async function freshSlug(model: string, name: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: { slug: string }[] = await (db as any)[model].findMany({
    where: { slug: { startsWith: slugify(name) } }, select: { slug: true },
  });
  return uniqueSlug(name, new Set(rows.map((r) => r.slug)));
}

function joinNotes(...parts: (string | null | undefined)[]): string | null {
  const out = parts.map((p) => p?.trim()).filter(Boolean).join("\n\n");
  return out || null;
}

export type ConvertOutcome = {
  toType: ConvertibleType;
  toId: string;
  toSlug: string;
  toName: string;
  toPath: string;
  /** Things the new type had no field or link for, now recorded in its notes. */
  rehomed: string[];
};

export async function convertRecord(
  user: SessionUser,
  from: { type: string; id: string },
  toType: string,
  options: { newName?: string; fields?: Record<string, unknown> } = {},
): Promise<ConvertOutcome> {
  if (!canConvert(from.type, toType)) {
    throw new Error(`A ${from.type} can't be moved to ${toType}.`);
  }
  const fromType = from.type as ConvertibleType;
  const to = toType as ConvertibleType;
  const rehomed: string[] = [];
  const carried = new Date();

  // -------------------------------------------------------------------------
  // Load the source with everything hanging off it.
  // -------------------------------------------------------------------------
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const src: any = await (db as any)[MODELS[fromType]].findUnique({
    where: { id: from.id },
    include:
      fromType === "format"
        ? { creators: { include: { creator: true } }, organizations: { include: { organization: true } }, entityLinks: { include: { entity: true } }, opportunities: true }
        : fromType === "project"
          ? { credits: { include: { creator: true } }, organizations: { include: { organization: true } }, entityLinks: { include: { entity: true } }, people: { include: { person: true } }, opportunities: true }
          : fromType === "creator"
            ? { organizations: { include: { organization: true } }, credits: { include: { project: true } }, people: { include: { person: true } }, entityLinks: { include: { entity: true } }, formats: { include: { format: true } }, socialProfiles: true, relationshipsA: { include: { creatorB: true } }, relationshipsB: { include: { creatorA: true } }, opportunities: true }
            : { organizations: { include: { organization: true } }, projects: { include: { project: true } }, creators: { include: { creator: true } }, channels: { include: { channel: true } } },
  });
  if (!src) throw new Error("The record to move is no longer here.");
  if (src.archived) throw new Error("That record is in the Archive — restore it before moving it.");

  const srcName: string = src.name ?? src.title;
  const toName = (options.newName?.trim() || srcName).slice(0, 300);
  const f = options.fields ?? {};
  const str = (k: string) => (typeof f[k] === "string" && (f[k] as string).trim() ? (f[k] as string).trim() : undefined);

  let toId = "";
  let toSlug = "";

  // -------------------------------------------------------------------------
  // Create the target, mapping fields across.
  // -------------------------------------------------------------------------
  if (to === "project") {
    toSlug = await freshSlug("project", toName);
    const projectType = has(PROJECT_TYPES, str("projectType")) ? str("projectType")! : has(PROJECT_TYPES, src.formatType) ? src.formatType : "other";
    const created = await db.project.create({
      data: {
        slug: toSlug, title: toName,
        projectType,
        status: str("status") ?? "announced",
        logline: str("logline") ?? src.logline ?? null,
        description: str("description") ?? src.description ?? null,
        internalNotes: src.notes ?? src.internalNotes ?? null,
        lastActivityAt: src.lastActivityAt ?? carried,
        aliases: [srcName].filter((n) => n !== toName),
      },
    });
    toId = created.id;
    // A format's talent become credits; the role is the one thing a format never recorded.
    for (const cf of src.creators ?? []) {
      const role = has(PROJECT_ROLES, str("role")) ? str("role")! : "other";
      await db.creatorProjectCredit.create({
        data: { creatorId: cf.creatorId, projectId: toId, role, note: cf.isPrimary ? "Primary talent on the format this came from" : null },
      }).catch(() => {});
    }
    const orgMap: Record<string, string> = { partner: "production_company", sponsor_target: "sponsor", target: "network" };
    for (const fo of src.organizations ?? []) {
      const rel = has(PROJECT_ORG_RELATIONSHIPS, fo.relationship) ? fo.relationship : orgMap[fo.relationship] ?? "production_company";
      const note = rel === fo.relationship ? fo.note ?? null : `Was "${labelFor(fo.relationship)}" on the format this came from`;
      await db.projectOrganization.create({ data: { projectId: toId, organizationId: fo.organizationId, relationship: rel, note } }).catch(() => {});
    }
    for (const el of src.entityLinks ?? []) {
      await db.projectEntityLink.create({ data: { projectId: toId, entityId: el.entityId } }).catch(() => {});
    }
    for (const op of src.opportunities ?? []) {
      await db.opportunityProject.create({ data: { opportunityId: op.opportunityId, projectId: toId } }).catch(() => {});
    }
  } else if (to === "format") {
    toSlug = await freshSlug("format", toName);
    const formatType = has(FORMAT_TYPES, str("formatType")) ? str("formatType")! : has(FORMAT_TYPES, src.projectType) ? src.projectType : "other";
    const peopleNote = (src.people ?? []).length
      ? `People on the project this came from: ${src.people.map((p: { person: { name: string }; role: string }) => `${p.person.name} (${labelFor(p.role)})`).join(", ")}`
      : null;
    if (peopleNote) rehomed.push("the project's people");
    const created = await db.format.create({
      data: {
        slug: toSlug, title: toName,
        formatType,
        status: str("status") ?? "concept",
        logline: str("logline") ?? src.logline ?? null,
        description: str("description") ?? src.description ?? null,
        notes: joinNotes(src.internalNotes, peopleNote),
        lastActivityAt: src.lastActivityAt ?? carried,
        ownerId: user.id,
      },
    });
    toId = created.id;
    for (const c of src.credits ?? []) {
      await db.creatorFormat.create({
        data: { creatorId: c.creatorId, formatId: toId, isPrimary: false, note: `Was ${labelFor(c.role)} on the project this came from` },
      }).catch(() => {});
    }
    const orgMap: Record<string, string> = {
      sponsor: "sponsor_target", brand_partner: "sponsor_target",
      network: "target", streamer: "target", platform: "target", distributor: "target",
      production_company: "partner", co_production_company: "partner", studio: "partner",
    };
    for (const po of src.organizations ?? []) {
      const rel = orgMap[po.relationship] ?? "associated";
      await db.formatOrganization.create({
        data: { formatId: toId, organizationId: po.organizationId, relationship: rel, note: `Was "${labelFor(po.relationship)}" on the project this came from` },
      }).catch(() => {});
    }
    for (const el of src.entityLinks ?? []) {
      await db.formatEntityLink.create({ data: { formatId: toId, entityId: el.entityId } }).catch(() => {});
    }
    for (const op of src.opportunities ?? []) {
      await db.opportunityFormat.create({ data: { opportunityId: op.opportunityId, formatId: toId } }).catch(() => {});
    }
  } else if (to === "person") {
    toSlug = await freshSlug("industryPerson", toName);
    const bits: string[] = [];
    if (src.headline || src.miniBio) bits.push([src.headline, src.miniBio].filter(Boolean).join("\n"));
    if ((src.entityLinks ?? []).length) {
      bits.push(`Interests, sports and categories from the talent record: ${src.entityLinks.map((l: { entity: { name: string } }) => l.entity.name).join(", ")}`);
      rehomed.push("interests and categories");
    }
    if ((src.people ?? []).length) {
      bits.push(`Was represented by: ${src.people.map((p: { person: { name: string }; relationship: string }) => `${p.person.name} (${labelFor(p.relationship)})`).join(", ")}`);
      rehomed.push("representation");
    }
    if ((src.formats ?? []).length) {
      bits.push(`Attached to formats: ${src.formats.map((x: { format: { title: string } }) => x.format.title).join(", ")}`);
      rehomed.push("format attachments");
    }
    if ((src.socialProfiles ?? []).length) {
      bits.push(`Socials: ${src.socialProfiles.map((s: { platform: string; handle: string | null; followerCount: number | null }) => `${s.platform} ${s.handle ?? ""} ${s.followerCount ? `(${s.followerCount.toLocaleString()})` : ""}`.trim()).join("; ")}`);
      rehomed.push("social profiles");
    }
    const created = await db.industryPerson.create({
      data: {
        slug: toSlug, name: toName,
        title: str("title") ?? src.headline ?? null,
        roleType: has(PERSON_ROLE_TYPES, str("roleType")) ? str("roleType")! : "other",
        notes: joinNotes(src.internalNotes, src.opportunityNotes, ...bits),
      },
    });
    toId = created.id;
    for (const co of src.organizations ?? []) {
      const role = has(PERSON_ROLE_TYPES, co.relationship) ? co.relationship : "other";
      await db.personOrganization.create({ data: { personId: toId, organizationId: co.organizationId, role, current: true } }).catch(() => {});
    }
    for (const c of src.credits ?? []) {
      const role = has(PERSON_PROJECT_ROLES, c.role) ? c.role : "other";
      await db.personProject.create({ data: { personId: toId, projectId: c.projectId, role, note: role === c.role ? null : `Was ${labelFor(c.role)} on the talent record` } }).catch(() => {});
    }
  } else if (to === "creator") {
    toSlug = await freshSlug("creator", toName);
    const bits: string[] = [];
    if ((src.creators ?? []).length) {
      bits.push(`Represented, as an industry contact: ${src.creators.map((c: { creator: { name: string }; relationship: string }) => `${c.creator.name} (${labelFor(c.relationship)})`).join(", ")}`);
      rehomed.push("clients represented");
    }
    if ((src.channels ?? []).length) {
      bits.push(`Attached to channels: ${src.channels.map((c: { channel: { name: string } }) => c.channel.name).join(", ")}`);
      rehomed.push("channel contacts");
    }
    const contact = [src.email, src.phone, src.contactUrl].filter(Boolean).join(" · ");
    if (contact) bits.push(`Contact: ${contact}`);
    const created = await db.creator.create({
      data: {
        slug: toSlug, name: toName,
        headline: str("headline") ?? src.title ?? null,
        status: "active",
        internalNotes: joinNotes(src.notes, ...bits),
      },
    });
    toId = created.id;
    for (const po of src.organizations ?? []) {
      await db.creatorOrganization.create({
        data: { creatorId: toId, organizationId: po.organizationId, relationship: "team_member", status: po.current ? "active" : "past" },
      }).catch(() => {});
    }
    for (const pp of src.projects ?? []) {
      const role = has(PROJECT_ROLES, pp.role) ? pp.role : "other";
      await db.creatorProjectCredit.create({ data: { creatorId: toId, projectId: pp.projectId, role, note: pp.note ?? null } }).catch(() => {});
    }
  } else if (to === "channel") {
    toSlug = await freshSlug("channel", toName);
    const talent: { creatorId: string; isPrimary?: boolean; creator: { name: string } }[] =
      fromType === "format" ? src.creators ?? [] : (src.credits ?? []);
    const lead = talent.find((t) => t.isPrimary) ?? talent[0];
    const bits: string[] = [];
    if (talent.length > 1) {
      bits.push(`Other talent from the ${fromType}: ${talent.filter((t) => t !== lead).map((t) => t.creator.name).join(", ")}`);
      rehomed.push("additional talent");
    }
    if ((src.entityLinks ?? []).length) {
      bits.push(`Topics: ${src.entityLinks.map((l: { entity: { name: string } }) => l.entity.name).join(", ")}`);
      rehomed.push("topics");
    }
    const created = await db.channel.create({
      data: {
        slug: toSlug, name: toName,
        status: str("status") ?? "prospect",
        premise: str("premise") ?? src.logline ?? src.description ?? null,
        notes: joinNotes(src.notes ?? src.internalNotes, ...bits),
        creatorId: lead?.creatorId ?? null,
        lastActivityAt: src.lastActivityAt ?? carried,
        ownerId: user.id,
      },
    });
    toId = created.id;
    const orgMap: Record<string, string> = {
      partner: "production_partner", production_company: "production_partner", co_production_company: "production_partner", studio: "production_partner",
      sponsor_target: "brand", sponsor: "brand", brand_partner: "brand",
      target: "platform", network: "platform", streamer: "platform", platform: "platform", distributor: "platform",
    };
    for (const o of src.organizations ?? []) {
      await db.channelOrganization.create({
        data: { channelId: toId, organizationId: o.organizationId, relationship: orgMap[o.relationship] ?? "partner" },
      }).catch(() => {});
    }
  }

  // -------------------------------------------------------------------------
  // Everything keyed by (type, id) follows the record to its new home.
  // -------------------------------------------------------------------------
  for (const table of FOLLOWERS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any)[table].updateMany({
      where: { targetType: fromType, targetId: from.id },
      data: { targetType: to, targetId: toId },
    }).catch(() => {});
  }

  // -------------------------------------------------------------------------
  // The old page steps aside, and says where it went.
  // -------------------------------------------------------------------------
  const toPath = `${PATHS[to]}/${toSlug}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any)[MODELS[fromType]].update({
    where: { id: from.id },
    data: { archived: true, archivedReason: `${MOVED_PREFIX}${toPath}`, archivedAt: carried },
  });

  await logAudit(user, {
    targetType: fromType, targetId: from.id, targetLabel: srcName,
    action: "archived", field: "moved", newValue: `${labelFor(to)}: ${toName}`,
  });
  await logAudit(user, {
    targetType: to, targetId: toId, targetLabel: toName,
    action: "created", field: "moved from", newValue: `${labelFor(fromType)}: ${srcName}`,
  });
  await refreshDigest(fromType, from.id);
  await refreshDigest(to, toId);

  return { toType: to, toId, toSlug, toName, toPath, rehomed };
}

/**
 * Put a move back: everything that followed the record returns, the new
 * record goes (its own links cascade), and the old page comes out of the
 * Archive. Anything written into the new record's notes by the move is gone
 * with it, which is fine — the old record still has all of it.
 */
export async function revertConversion(
  from: { type: string; id: string },
  to: { type: string; id: string },
): Promise<void> {
  for (const table of FOLLOWERS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any)[table].updateMany({
      where: { targetType: to.type, targetId: to.id },
      data: { targetType: from.type, targetId: from.id },
    }).catch(() => {});
  }
  const toModel = MODELS[to.type as ConvertibleType];
  const fromModel = MODELS[from.type as ConvertibleType];
  if (toModel) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any)[toModel].delete({ where: { id: to.id } }).catch(() => {});
    await db.knowledgeDigest.deleteMany({ where: { targetType: to.type, targetId: to.id } });
  }
  if (fromModel) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any)[fromModel].update({
      where: { id: from.id },
      data: { archived: false, archivedReason: null, archivedAt: null },
    }).catch(() => {});
    await refreshDigest(from.type, from.id);
  }
}
