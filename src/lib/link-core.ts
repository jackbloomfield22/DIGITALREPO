// Core relationship operations shared by the link server actions and the
// ingest apply engine (which runs outside a request context). Idempotent
// upserts; symmetric creator pairs normalized; digest refresh for both sides.

import { db } from "@/lib/db";
import { refreshDigest } from "@/lib/ingest/digest";
import { LINK_SPECS } from "@/lib/ingest/registry";
import type { LinkPayload } from "@/lib/link-schema";

/** A link touches two records; the audit hook refreshes one, this gets both. */
export async function refreshLinkSides(p: LinkPayload) {
  const spec = LINK_SPECS[p.kind];
  if (!spec) return;
  const record = p as unknown as Record<string, string>;
  await refreshDigest(spec.a.targetType, record[spec.a.idField]);
  await refreshDigest(spec.b.targetType, record[spec.b.idField]);
}

// One server action pair covers every relationship in the graph. Adds are
// idempotent (linking Soccer twice never duplicates the relationship) and
// every change is audited. The payload vocabulary lives in
// src/lib/link-schema.ts so non-server modules (ingest registry) share it.

export type { LinkPayload };
export type LinkResult = { ok: true } | { ok: false; error: string };

export async function label(table: "creator" | "project" | "organization" | "format" | "opportunity" | "entity" | "person" | "collection", recordId: string): Promise<string> {
  try {
    switch (table) {
      case "creator": return (await db.creator.findUnique({ where: { id: recordId } }))?.name ?? "?";
      case "project": return (await db.project.findUnique({ where: { id: recordId } }))?.title ?? "?";
      case "organization": return (await db.organization.findUnique({ where: { id: recordId } }))?.name ?? "?";
      case "format": return (await db.format.findUnique({ where: { id: recordId } }))?.title ?? "?";
      case "opportunity": return (await db.opportunity.findUnique({ where: { id: recordId } }))?.title ?? "?";
      case "entity": return (await db.entity.findUnique({ where: { id: recordId } }))?.name ?? "?";
      case "person": return (await db.industryPerson.findUnique({ where: { id: recordId } }))?.name ?? "?";
      case "collection": return (await db.collection.findUnique({ where: { id: recordId } }))?.name ?? "?";
    }
  } catch {
    return "?";
  }
}

/** Which record the audit entry hangs off, plus a description of the other side. */
export async function auditInfo(p: LinkPayload): Promise<{ targetType: string; targetId: string; targetLabel: string; other: string }> {
  switch (p.kind) {
    case "creator_entity": return { targetType: "creator", targetId: p.creatorId, targetLabel: await label("creator", p.creatorId), other: await label("entity", p.entityId) };
    case "creator_format": return { targetType: "creator", targetId: p.creatorId, targetLabel: await label("creator", p.creatorId), other: await label("format", p.formatId) };
    case "creator_project": return { targetType: "creator", targetId: p.creatorId, targetLabel: await label("creator", p.creatorId), other: `${await label("project", p.projectId)} (${p.role})` };
    case "creator_org": return { targetType: "creator", targetId: p.creatorId, targetLabel: await label("creator", p.creatorId), other: `${await label("organization", p.organizationId)} (${p.relationship})` };
    case "creator_person": return { targetType: "creator", targetId: p.creatorId, targetLabel: await label("creator", p.creatorId), other: `${await label("person", p.personId)} (${p.relationship})` };
    case "creator_creator": return { targetType: "creator", targetId: p.creatorAId, targetLabel: await label("creator", p.creatorAId), other: `${await label("creator", p.creatorBId)} (${p.relationship})` };
    case "project_org": return { targetType: "project", targetId: p.projectId, targetLabel: await label("project", p.projectId), other: `${await label("organization", p.organizationId)} (${p.relationship})` };
    case "project_entity": return { targetType: "project", targetId: p.projectId, targetLabel: await label("project", p.projectId), other: await label("entity", p.entityId) };
    case "project_person": return { targetType: "project", targetId: p.projectId, targetLabel: await label("project", p.projectId), other: `${await label("person", p.personId)} (${p.role})` };
    case "format_entity": return { targetType: "format", targetId: p.formatId, targetLabel: await label("format", p.formatId), other: await label("entity", p.entityId) };
    case "format_org": return { targetType: "format", targetId: p.formatId, targetLabel: await label("format", p.formatId), other: await label("organization", p.organizationId) };
    case "opportunity_creator": return { targetType: "opportunity", targetId: p.opportunityId, targetLabel: await label("opportunity", p.opportunityId), other: await label("creator", p.creatorId) };
    case "opportunity_format": return { targetType: "opportunity", targetId: p.opportunityId, targetLabel: await label("opportunity", p.opportunityId), other: await label("format", p.formatId) };
    case "opportunity_project": return { targetType: "opportunity", targetId: p.opportunityId, targetLabel: await label("opportunity", p.opportunityId), other: await label("project", p.projectId) };
    case "opportunity_org": return { targetType: "opportunity", targetId: p.opportunityId, targetLabel: await label("opportunity", p.opportunityId), other: await label("organization", p.organizationId) };
    case "opportunity_entity": return { targetType: "opportunity", targetId: p.opportunityId, targetLabel: await label("opportunity", p.opportunityId), other: await label("entity", p.entityId) };
    case "collection_item": return { targetType: "collection", targetId: p.collectionId, targetLabel: await label("collection", p.collectionId), other: await label(p.targetType as "creator", p.targetId) };
  }
}

export async function upsertLink(p: LinkPayload): Promise<void> {
  switch (p.kind) {
    case "creator_entity": {
      const relationship = p.relationship ?? "";
      await db.creatorEntityLink.upsert({
        where: { creatorId_entityId_relationship: { creatorId: p.creatorId, entityId: p.entityId, relationship } },
        update: {},
        create: { creatorId: p.creatorId, entityId: p.entityId, relationship },
      });
      return;
    }
    case "creator_format":
      await db.creatorFormat.upsert({
        where: { creatorId_formatId: { creatorId: p.creatorId, formatId: p.formatId } },
        update: p.isPrimary != null ? { isPrimary: p.isPrimary } : {},
        create: { creatorId: p.creatorId, formatId: p.formatId, isPrimary: !!p.isPrimary },
      });
      return;
    case "creator_project":
      await db.creatorProjectCredit.upsert({
        where: { creatorId_projectId_role: { creatorId: p.creatorId, projectId: p.projectId, role: p.role } },
        update: {},
        create: { creatorId: p.creatorId, projectId: p.projectId, role: p.role },
      });
      return;
    case "creator_org":
      await db.creatorOrganization.upsert({
        where: { creatorId_organizationId_relationship: { creatorId: p.creatorId, organizationId: p.organizationId, relationship: p.relationship } },
        update: p.status ? { status: p.status } : {},
        create: { creatorId: p.creatorId, organizationId: p.organizationId, relationship: p.relationship, status: p.status ?? "active" },
      });
      return;
    case "creator_person": {
      // Re-linking an existing rep updates its status fields — the talent
      // page's "mark past/current" toggle relies on this upsert path.
      const status = {
        ...(p.current === undefined ? {} : { current: p.current }),
        ...(p.start === undefined ? {} : { start: p.start || null }),
        ...(p.end === undefined ? {} : { end: p.end || null }),
      };
      await db.creatorPerson.upsert({
        where: { creatorId_personId_relationship: { creatorId: p.creatorId, personId: p.personId, relationship: p.relationship } },
        update: status,
        create: { creatorId: p.creatorId, personId: p.personId, relationship: p.relationship, ...status },
      });
      return;
    }
    case "creator_creator": {
      if (p.creatorAId === p.creatorBId) throw new Error("A creator can't be linked to themselves.");
      const [creatorAId, creatorBId] = [p.creatorAId, p.creatorBId].sort();
      await db.creatorRelationship.upsert({
        where: { creatorAId_creatorBId_relationship: { creatorAId, creatorBId, relationship: p.relationship } },
        update: p.note ? { note: p.note } : {},
        create: { creatorAId, creatorBId, relationship: p.relationship, note: p.note },
      });
      return;
    }
    case "project_org":
      await db.projectOrganization.upsert({
        where: { projectId_organizationId_relationship: { projectId: p.projectId, organizationId: p.organizationId, relationship: p.relationship } },
        update: {},
        create: { projectId: p.projectId, organizationId: p.organizationId, relationship: p.relationship },
      });
      return;
    case "project_entity":
      await db.projectEntityLink.upsert({
        where: { projectId_entityId: { projectId: p.projectId, entityId: p.entityId } },
        update: {},
        create: { projectId: p.projectId, entityId: p.entityId },
      });
      return;
    case "project_person":
      await db.personProject.upsert({
        where: { personId_projectId_role: { personId: p.personId, projectId: p.projectId, role: p.role } },
        update: {},
        create: { personId: p.personId, projectId: p.projectId, role: p.role },
      });
      return;
    case "format_entity":
      await db.formatEntityLink.upsert({
        where: { formatId_entityId: { formatId: p.formatId, entityId: p.entityId } },
        update: {},
        create: { formatId: p.formatId, entityId: p.entityId },
      });
      return;
    case "format_org": {
      const relationship = p.relationship ?? "associated";
      await db.formatOrganization.upsert({
        where: { formatId_organizationId_relationship: { formatId: p.formatId, organizationId: p.organizationId, relationship } },
        update: {},
        create: { formatId: p.formatId, organizationId: p.organizationId, relationship },
      });
      return;
    }
    case "opportunity_creator":
      await db.opportunityCreator.upsert({
        where: { opportunityId_creatorId: { opportunityId: p.opportunityId, creatorId: p.creatorId } },
        update: p.status ? { status: p.status } : {},
        create: { opportunityId: p.opportunityId, creatorId: p.creatorId, status: p.status ?? "candidate" },
      });
      return;
    case "opportunity_format":
      await db.opportunityFormat.upsert({
        where: { opportunityId_formatId: { opportunityId: p.opportunityId, formatId: p.formatId } },
        update: {},
        create: { opportunityId: p.opportunityId, formatId: p.formatId },
      });
      return;
    case "opportunity_project":
      await db.opportunityProject.upsert({
        where: { opportunityId_projectId: { opportunityId: p.opportunityId, projectId: p.projectId } },
        update: {},
        create: { opportunityId: p.opportunityId, projectId: p.projectId },
      });
      return;
    case "opportunity_org":
      await db.opportunityOrganization.upsert({
        where: { opportunityId_organizationId: { opportunityId: p.opportunityId, organizationId: p.organizationId } },
        update: {},
        create: { opportunityId: p.opportunityId, organizationId: p.organizationId },
      });
      return;
    case "opportunity_entity":
      await db.opportunityEntityLink.upsert({
        where: { opportunityId_entityId: { opportunityId: p.opportunityId, entityId: p.entityId } },
        update: {},
        create: { opportunityId: p.opportunityId, entityId: p.entityId },
      });
      return;
    case "collection_item":
      await db.collectionItem.upsert({
        where: { collectionId_targetType_targetId: { collectionId: p.collectionId, targetType: p.targetType, targetId: p.targetId } },
        update: {},
        create: { collectionId: p.collectionId, targetType: p.targetType, targetId: p.targetId },
      });
      return;
  }
}

export async function deleteLink(p: LinkPayload): Promise<void> {
  switch (p.kind) {
    case "creator_entity":
      await db.creatorEntityLink.deleteMany({
        where: { creatorId: p.creatorId, entityId: p.entityId, ...(p.relationship != null ? { relationship: p.relationship } : {}) },
      });
      return;
    case "creator_format":
      await db.creatorFormat.deleteMany({ where: { creatorId: p.creatorId, formatId: p.formatId } });
      return;
    case "creator_project":
      await db.creatorProjectCredit.deleteMany({ where: { creatorId: p.creatorId, projectId: p.projectId, role: p.role } });
      return;
    case "creator_org":
      await db.creatorOrganization.deleteMany({ where: { creatorId: p.creatorId, organizationId: p.organizationId, relationship: p.relationship } });
      return;
    case "creator_person":
      await db.creatorPerson.deleteMany({ where: { creatorId: p.creatorId, personId: p.personId, relationship: p.relationship } });
      return;
    case "creator_creator": {
      const [creatorAId, creatorBId] = [p.creatorAId, p.creatorBId].sort();
      await db.creatorRelationship.deleteMany({ where: { creatorAId, creatorBId, relationship: p.relationship } });
      return;
    }
    case "project_org":
      await db.projectOrganization.deleteMany({ where: { projectId: p.projectId, organizationId: p.organizationId, relationship: p.relationship } });
      return;
    case "project_entity":
      await db.projectEntityLink.deleteMany({ where: { projectId: p.projectId, entityId: p.entityId } });
      return;
    case "project_person":
      await db.personProject.deleteMany({ where: { personId: p.personId, projectId: p.projectId, role: p.role } });
      return;
    case "format_entity":
      await db.formatEntityLink.deleteMany({ where: { formatId: p.formatId, entityId: p.entityId } });
      return;
    case "format_org":
      await db.formatOrganization.deleteMany({ where: { formatId: p.formatId, organizationId: p.organizationId } });
      return;
    case "opportunity_creator":
      await db.opportunityCreator.deleteMany({ where: { opportunityId: p.opportunityId, creatorId: p.creatorId } });
      return;
    case "opportunity_format":
      await db.opportunityFormat.deleteMany({ where: { opportunityId: p.opportunityId, formatId: p.formatId } });
      return;
    case "opportunity_project":
      await db.opportunityProject.deleteMany({ where: { opportunityId: p.opportunityId, projectId: p.projectId } });
      return;
    case "opportunity_org":
      await db.opportunityOrganization.deleteMany({ where: { opportunityId: p.opportunityId, organizationId: p.organizationId } });
      return;
    case "opportunity_entity":
      await db.opportunityEntityLink.deleteMany({ where: { opportunityId: p.opportunityId, entityId: p.entityId } });
      return;
    case "collection_item":
      await db.collectionItem.deleteMany({ where: { collectionId: p.collectionId, targetType: p.targetType, targetId: p.targetId } });
      return;
  }
}

