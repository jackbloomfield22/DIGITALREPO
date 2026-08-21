import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { slugify, uniqueSlug, normalizeName } from "@/lib/slug";
import type { SessionUser } from "@/lib/auth";
import { ENTITY_KINDS } from "@/lib/taxonomy";

// Research Inbox: paste unstructured research, AI proposes structured changes,
// an editor reviews, then applies. Nothing touches canonical data until Apply.

const opSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("create_creator"), name: z.string().min(1).max(200) }),
  z.object({ op: z.literal("create_project"), title: z.string().min(1).max(300), projectType: z.string().max(40).optional() }),
  z.object({ op: z.literal("create_organization"), name: z.string().min(1).max(300), orgType: z.string().max(40).optional() }),
  z.object({ op: z.literal("create_entity"), kind: z.string().max(30), name: z.string().min(1).max(100) }),
  z.object({ op: z.literal("link_credit"), creatorName: z.string().max(200), projectTitle: z.string().max(300), role: z.string().max(50) }),
  z.object({ op: z.literal("link_project_org"), projectTitle: z.string().max(300), orgName: z.string().max(300), relationship: z.string().max(50) }),
  z.object({ op: z.literal("link_creator_org"), creatorName: z.string().max(200), orgName: z.string().max(300), relationship: z.string().max(50) }),
  z.object({ op: z.literal("link_creator_entity"), creatorName: z.string().max(200), entityKind: z.string().max(30), entityName: z.string().max(100), relationship: z.string().max(30).optional() }),
  z.object({ op: z.literal("link_creator_format"), creatorName: z.string().max(200), formatTitle: z.string().max(300) }),
  z.object({ op: z.literal("add_social"), creatorName: z.string().max(200), platform: z.string().max(30), handle: z.string().max(120).optional(), followers: z.number().int().min(0).optional() }),
  z.object({ op: z.literal("set_creator_bio"), creatorName: z.string().max(200), field: z.enum(["miniBio", "digitalSummary", "opportunityNotes", "headline"]), value: z.string().max(8000) }),
  z.object({ op: z.literal("note"), text: z.string().max(2000) }),
]);

export const proposalSchema = z.object({
  summary: z.string().max(1000).optional(),
  ops: z.array(opSchema).max(60),
});

export type Proposal = z.infer<typeof proposalSchema>;
export type ProposalOp = z.infer<typeof opSchema>;

const PARSE_PROMPT = `You convert pasted entertainment-industry research notes into structured database operations for a creator-intelligence database.

The database has: creators, projects (real existing productions), organizations (companies/brands/networks/agencies), internal formats, taxonomy entities (kinds: interest, hobby, sport, location, genre, creator_category, skill, vertical, audience_type, tag), industry people.

Available operations (JSON objects):
{"op":"create_creator","name":...}
{"op":"create_project","title":...,"projectType":"tv_series|documentary|docuseries|youtube_series|podcast|livestream|film|reality_series|competition_show|branded_series|short_form_series|social_franchise|special|digital_franchise|other"}
{"op":"create_organization","name":...,"orgType":"production_company|studio|network|streamer|digital_platform|brand|agency|management_company|creator_owned_company|investment_firm|startup|podcast_company|publisher|sports_team|sports_league|nonprofit|other"}
{"op":"create_entity","kind":"interest|sport|location|hobby|creator_category|vertical|tag","name":...}
{"op":"link_credit","creatorName":...,"projectTitle":...,"role":"host|co_host|star|subject|cast|contestant|participant|guest|recurring_guest|creator|executive_producer|producer|director|writer|voice_talent|correspondent|founder|owner|other"}
{"op":"link_project_org","projectTitle":...,"orgName":...,"relationship":"production_company|co_production_company|studio|network|streamer|distributor|financier|brand_partner|sponsor|agency|rights_holder|publisher|platform"}
{"op":"link_creator_org","creatorName":...,"orgName":...,"relationship":"ambassador|campaign|sponsored_content|partner|advisor|investor|founder|owner|athlete|collaboration|other"}
{"op":"link_creator_entity","creatorName":...,"entityKind":...,"entityName":...,"relationship":"based_in|hometown|born_in (locations only, else omit)"}
{"op":"link_creator_format","creatorName":...,"formatTitle":...}
{"op":"add_social","creatorName":...,"platform":"instagram|tiktok|youtube|x|twitch|facebook|snapchat|threads|podcast|other","handle":...,"followers":...}
{"op":"set_creator_bio","creatorName":...,"field":"miniBio|digitalSummary|opportunityNotes|headline","value":...}
{"op":"note","text":...}  // information that doesn't fit any operation

Rules:
- Only extract facts stated in the text. Never invent or embellish.
- Create-ops are idempotent: emit them for any name referenced by a link (existing records are reused automatically; duplicates are prevented downstream).
- Use link ops for every relationship stated in the text.
- Respond with ONLY a JSON object: {"summary": "<one sentence>", "ops": [...]}. No markdown, no commentary.`;

export async function parseResearchText(rawText: string): Promise<Proposal> {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: process.env.AI_MODEL ?? "claude-opus-5",
    max_tokens: 8000,
    system: PARSE_PROMPT,
    messages: [{ role: "user", content: rawText.slice(0, 20_000) }],
  });
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const parsed = JSON.parse(text);
  return proposalSchema.parse(parsed);
}

// --- Apply -------------------------------------------------------------------

async function freshSlug(taken: { slug: string }[], name: string) {
  return uniqueSlug(name, new Set(taken.map((t) => t.slug)));
}

async function resolveCreator(name: string, user: SessionUser, created: string[]): Promise<string> {
  const norm = normalizeName(name);
  const all = await db.creator.findMany({ select: { id: true, name: true, aliases: true } });
  const hit = all.find((c) => normalizeName(c.name) === norm || c.aliases.some((a) => normalizeName(a) === norm));
  if (hit) return hit.id;
  const slugRows = await db.creator.findMany({ where: { slug: { startsWith: slugify(name) } }, select: { slug: true } });
  const creator = await db.creator.create({ data: { name: name.trim(), slug: await freshSlug(slugRows, name) } });
  await logAudit(user, { targetType: "creator", targetId: creator.id, targetLabel: creator.name, action: "created", field: "research inbox" });
  created.push(`Creator: ${creator.name}`);
  return creator.id;
}

async function resolveProject(title: string, projectType: string | undefined, user: SessionUser, created: string[]): Promise<string> {
  const norm = normalizeName(title);
  const all = await db.project.findMany({ select: { id: true, title: true } });
  const hit = all.find((p) => normalizeName(p.title) === norm);
  if (hit) return hit.id;
  const slugRows = await db.project.findMany({ where: { slug: { startsWith: slugify(title) } }, select: { slug: true } });
  const project = await db.project.create({ data: { title: title.trim(), slug: await freshSlug(slugRows, title), projectType } });
  await logAudit(user, { targetType: "project", targetId: project.id, targetLabel: project.title, action: "created", field: "research inbox" });
  created.push(`Project: ${project.title}`);
  return project.id;
}

async function resolveOrg(name: string, orgType: string | undefined, user: SessionUser, created: string[]): Promise<string> {
  const norm = normalizeName(name);
  const all = await db.organization.findMany({ select: { id: true, name: true, aliases: true } });
  const hit = all.find((o) => normalizeName(o.name) === norm || o.aliases.some((a) => normalizeName(a) === norm));
  if (hit) return hit.id;
  const slugRows = await db.organization.findMany({ where: { slug: { startsWith: slugify(name) } }, select: { slug: true } });
  const org = await db.organization.create({ data: { name: name.trim(), slug: await freshSlug(slugRows, name), types: orgType ? [orgType] : [] } });
  await logAudit(user, { targetType: "organization", targetId: org.id, targetLabel: org.name, action: "created", field: "research inbox" });
  created.push(`Organization: ${org.name}`);
  return org.id;
}

async function resolveEntity(kind: string, name: string, created: string[]): Promise<string> {
  const safeKind = (ENTITY_KINDS as readonly string[]).includes(kind) ? kind : "tag";
  const slug = slugify(name);
  const existing = await db.entity.findUnique({ where: { kind_slug: { kind: safeKind, slug } } });
  if (existing) return existing.id;
  const entity = await db.entity.create({ data: { kind: safeKind, slug, name: name.trim() } });
  created.push(`${safeKind}: ${entity.name}`);
  return entity.id;
}

async function resolveFormat(title: string, user: SessionUser, created: string[]): Promise<string> {
  const norm = normalizeName(title);
  const all = await db.format.findMany({ select: { id: true, title: true } });
  const hit = all.find((f) => normalizeName(f.title) === norm);
  if (hit) return hit.id;
  const slugRows = await db.format.findMany({ where: { slug: { startsWith: slugify(title) } }, select: { slug: true } });
  const format = await db.format.create({ data: { title: title.trim(), slug: await freshSlug(slugRows, title), ownerId: user.id } });
  await logAudit(user, { targetType: "format", targetId: format.id, targetLabel: format.title, action: "created", field: "research inbox" });
  created.push(`Format: ${format.title}`);
  return format.id;
}

export async function applyProposal(
  proposal: Proposal,
  user: SessionUser,
): Promise<{ applied: string[]; created: string[]; skipped: string[] }> {
  const applied: string[] = [];
  const created: string[] = [];
  const skipped: string[] = [];

  for (const op of proposal.ops) {
    try {
      switch (op.op) {
        case "create_creator":
          await resolveCreator(op.name, user, created);
          break;
        case "create_project":
          await resolveProject(op.title, op.projectType, user, created);
          break;
        case "create_organization":
          await resolveOrg(op.name, op.orgType, user, created);
          break;
        case "create_entity":
          await resolveEntity(op.kind, op.name, created);
          break;
        case "link_credit": {
          const creatorId = await resolveCreator(op.creatorName, user, created);
          const projectId = await resolveProject(op.projectTitle, undefined, user, created);
          await db.creatorProjectCredit.upsert({
            where: { creatorId_projectId_role: { creatorId, projectId, role: op.role } },
            update: {},
            create: { creatorId, projectId, role: op.role },
          });
          applied.push(`${op.creatorName} → ${op.projectTitle} (${op.role})`);
          break;
        }
        case "link_project_org": {
          const projectId = await resolveProject(op.projectTitle, undefined, user, created);
          const organizationId = await resolveOrg(op.orgName, undefined, user, created);
          await db.projectOrganization.upsert({
            where: { projectId_organizationId_relationship: { projectId, organizationId, relationship: op.relationship } },
            update: {},
            create: { projectId, organizationId, relationship: op.relationship },
          });
          applied.push(`${op.projectTitle} → ${op.orgName} (${op.relationship})`);
          break;
        }
        case "link_creator_org": {
          const creatorId = await resolveCreator(op.creatorName, user, created);
          const organizationId = await resolveOrg(op.orgName, undefined, user, created);
          await db.creatorOrganization.upsert({
            where: { creatorId_organizationId_relationship: { creatorId, organizationId, relationship: op.relationship } },
            update: {},
            create: { creatorId, organizationId, relationship: op.relationship },
          });
          applied.push(`${op.creatorName} → ${op.orgName} (${op.relationship})`);
          break;
        }
        case "link_creator_entity": {
          const creatorId = await resolveCreator(op.creatorName, user, created);
          const entityId = await resolveEntity(op.entityKind, op.entityName, created);
          const relationship = op.relationship ?? "";
          await db.creatorEntityLink.upsert({
            where: { creatorId_entityId_relationship: { creatorId, entityId, relationship } },
            update: {},
            create: { creatorId, entityId, relationship },
          });
          applied.push(`${op.creatorName} → ${op.entityName}`);
          break;
        }
        case "link_creator_format": {
          const creatorId = await resolveCreator(op.creatorName, user, created);
          const formatId = await resolveFormat(op.formatTitle, user, created);
          await db.creatorFormat.upsert({
            where: { creatorId_formatId: { creatorId, formatId } },
            update: {},
            create: { creatorId, formatId },
          });
          applied.push(`${op.creatorName} → ${op.formatTitle}`);
          break;
        }
        case "add_social": {
          const creatorId = await resolveCreator(op.creatorName, user, created);
          const existing = await db.socialProfile.findFirst({ where: { creatorId, platform: op.platform } });
          if (existing) {
            await db.socialProfile.update({
              where: { id: existing.id },
              data: {
                handle: op.handle ?? existing.handle,
                ...(op.followers != null ? { followerCount: op.followers, countUpdatedAt: new Date() } : {}),
              },
            });
          } else {
            await db.socialProfile.create({
              data: { creatorId, platform: op.platform, handle: op.handle, followerCount: op.followers, countUpdatedAt: op.followers != null ? new Date() : null },
            });
          }
          applied.push(`${op.creatorName} social: ${op.platform}`);
          break;
        }
        case "set_creator_bio": {
          const creatorId = await resolveCreator(op.creatorName, user, created);
          const creator = await db.creator.findUnique({ where: { id: creatorId } });
          if (creator && !creator[op.field]) {
            await db.creator.update({ where: { id: creatorId }, data: { [op.field]: op.value } });
            applied.push(`${op.creatorName} ${op.field} set`);
          } else {
            skipped.push(`${op.creatorName} ${op.field} already has content — left unchanged`);
          }
          break;
        }
        case "note":
          skipped.push(`Note (no operation): ${op.text.slice(0, 120)}`);
          break;
      }
    } catch (e) {
      skipped.push(`Failed: ${JSON.stringify(op).slice(0, 100)} — ${e instanceof Error ? e.message : "error"}`);
    }
  }
  return { applied, created, skipped };
}
