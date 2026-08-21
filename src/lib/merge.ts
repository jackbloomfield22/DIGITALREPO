import { db } from "@/lib/db";

// Merge cores — shared by admin server actions and tests. Relationships of the
// source record are re-pointed at the target; rows that would collide with an
// existing target relationship are dropped (the relationship already exists).
// The source's name survives as an alias on the target.

export async function mergeEntitiesCore(sourceId: string, targetId: string): Promise<void> {
  if (sourceId === targetId) throw new Error("Pick two different entities.");
  const [source, target] = await Promise.all([
    db.entity.findUnique({ where: { id: sourceId } }),
    db.entity.findUnique({ where: { id: targetId } }),
  ]);
  if (!source || !target) throw new Error("Entity not found.");

  await db.$transaction(async (tx) => {
    const creatorLinks = await tx.creatorEntityLink.findMany({ where: { entityId: sourceId } });
    for (const link of creatorLinks) {
      const clash = await tx.creatorEntityLink.findUnique({
        where: { creatorId_entityId_relationship: { creatorId: link.creatorId, entityId: targetId, relationship: link.relationship } },
      });
      if (clash) await tx.creatorEntityLink.delete({ where: { id: link.id } });
      else await tx.creatorEntityLink.update({ where: { id: link.id }, data: { entityId: targetId } });
    }
    const formatLinks = await tx.formatEntityLink.findMany({ where: { entityId: sourceId } });
    for (const link of formatLinks) {
      const clash = await tx.formatEntityLink.findUnique({
        where: { formatId_entityId: { formatId: link.formatId, entityId: targetId } },
      });
      if (clash) await tx.formatEntityLink.delete({ where: { id: link.id } });
      else await tx.formatEntityLink.update({ where: { id: link.id }, data: { entityId: targetId } });
    }
    const projectLinks = await tx.projectEntityLink.findMany({ where: { entityId: sourceId } });
    for (const link of projectLinks) {
      const clash = await tx.projectEntityLink.findUnique({
        where: { projectId_entityId: { projectId: link.projectId, entityId: targetId } },
      });
      if (clash) await tx.projectEntityLink.delete({ where: { id: link.id } });
      else await tx.projectEntityLink.update({ where: { id: link.id }, data: { entityId: targetId } });
    }
    const oppLinks = await tx.opportunityEntityLink.findMany({ where: { entityId: sourceId } });
    for (const link of oppLinks) {
      const clash = await tx.opportunityEntityLink.findUnique({
        where: { opportunityId_entityId: { opportunityId: link.opportunityId, entityId: targetId } },
      });
      if (clash) await tx.opportunityEntityLink.delete({ where: { id: link.id } });
      else await tx.opportunityEntityLink.update({ where: { id: link.id }, data: { entityId: targetId } });
    }
    await tx.entity.update({
      where: { id: targetId },
      data: { aliases: [...new Set([...target.aliases, source.name])] },
    });
    await tx.entity.delete({ where: { id: sourceId } });
  });
}

export async function mergeOrganizationsCore(sourceId: string, targetId: string): Promise<void> {
  if (sourceId === targetId) throw new Error("Pick two different organizations.");
  const [source, target] = await Promise.all([
    db.organization.findUnique({ where: { id: sourceId } }),
    db.organization.findUnique({ where: { id: targetId } }),
  ]);
  if (!source || !target) throw new Error("Organization not found.");

  await db.$transaction(async (tx) => {
    const projectLinks = await tx.projectOrganization.findMany({ where: { organizationId: sourceId } });
    for (const link of projectLinks) {
      const clash = await tx.projectOrganization.findUnique({
        where: { projectId_organizationId_relationship: { projectId: link.projectId, organizationId: targetId, relationship: link.relationship } },
      });
      if (clash) await tx.projectOrganization.delete({ where: { id: link.id } });
      else await tx.projectOrganization.update({ where: { id: link.id }, data: { organizationId: targetId } });
    }
    const creatorLinks = await tx.creatorOrganization.findMany({ where: { organizationId: sourceId } });
    for (const link of creatorLinks) {
      const clash = await tx.creatorOrganization.findUnique({
        where: { creatorId_organizationId_relationship: { creatorId: link.creatorId, organizationId: targetId, relationship: link.relationship } },
      });
      if (clash) await tx.creatorOrganization.delete({ where: { id: link.id } });
      else await tx.creatorOrganization.update({ where: { id: link.id }, data: { organizationId: targetId } });
    }
    const personLinks = await tx.personOrganization.findMany({ where: { organizationId: sourceId } });
    for (const link of personLinks) {
      const clash = await tx.personOrganization.findUnique({
        where: { personId_organizationId: { personId: link.personId, organizationId: targetId } },
      });
      if (clash) await tx.personOrganization.delete({ where: { id: link.id } });
      else await tx.personOrganization.update({ where: { id: link.id }, data: { organizationId: targetId } });
    }
    const formatLinks = await tx.formatOrganization.findMany({ where: { organizationId: sourceId } });
    for (const link of formatLinks) {
      const clash = await tx.formatOrganization.findUnique({
        where: { formatId_organizationId_relationship: { formatId: link.formatId, organizationId: targetId, relationship: link.relationship } },
      });
      if (clash) await tx.formatOrganization.delete({ where: { id: link.id } });
      else await tx.formatOrganization.update({ where: { id: link.id }, data: { organizationId: targetId } });
    }
    const oppLinks = await tx.opportunityOrganization.findMany({ where: { organizationId: sourceId } });
    for (const link of oppLinks) {
      const clash = await tx.opportunityOrganization.findUnique({
        where: { opportunityId_organizationId: { opportunityId: link.opportunityId, organizationId: targetId } },
      });
      if (clash) await tx.opportunityOrganization.delete({ where: { id: link.id } });
      else await tx.opportunityOrganization.update({ where: { id: link.id }, data: { organizationId: targetId } });
    }
    await tx.organization.update({
      where: { id: targetId },
      data: {
        aliases: [...new Set([...target.aliases, source.name, ...source.aliases])],
        types: [...new Set([...target.types, ...source.types])],
      },
    });
    await tx.organization.delete({ where: { id: sourceId } });
  });
}
