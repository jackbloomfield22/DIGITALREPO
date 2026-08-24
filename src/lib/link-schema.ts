// The canonical vocabulary of relationship payloads. Shared by the link
// server actions (src/lib/actions/links.ts) and the ingest registry — a plain
// module because "use server" files may only export async functions.

import { z } from "zod";

const id = z.string().min(1);
const rel = z.string().min(1).max(60);

export const linkPayloadSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("creator_entity"), creatorId: id, entityId: id, relationship: z.string().max(60).optional() }),
  z.object({ kind: z.literal("creator_format"), creatorId: id, formatId: id, isPrimary: z.boolean().optional() }),
  z.object({ kind: z.literal("creator_project"), creatorId: id, projectId: id, role: rel }),
  z.object({ kind: z.literal("creator_org"), creatorId: id, organizationId: id, relationship: rel, status: z.string().max(30).optional() }),
  z.object({ kind: z.literal("creator_person"), creatorId: id, personId: id, relationship: rel }),
  z.object({ kind: z.literal("creator_creator"), creatorAId: id, creatorBId: id, relationship: rel, note: z.string().max(500).optional() }),
  z.object({ kind: z.literal("project_org"), projectId: id, organizationId: id, relationship: rel }),
  z.object({ kind: z.literal("project_entity"), projectId: id, entityId: id }),
  z.object({ kind: z.literal("project_person"), projectId: id, personId: id, role: rel }),
  z.object({ kind: z.literal("format_entity"), formatId: id, entityId: id }),
  z.object({ kind: z.literal("format_org"), formatId: id, organizationId: id, relationship: z.string().max(60).optional() }),
  z.object({ kind: z.literal("opportunity_creator"), opportunityId: id, creatorId: id, status: z.string().max(30).optional() }),
  z.object({ kind: z.literal("opportunity_format"), opportunityId: id, formatId: id }),
  z.object({ kind: z.literal("opportunity_project"), opportunityId: id, projectId: id }),
  z.object({ kind: z.literal("opportunity_org"), opportunityId: id, organizationId: id }),
  z.object({ kind: z.literal("opportunity_entity"), opportunityId: id, entityId: id }),
  z.object({ kind: z.literal("collection_item"), collectionId: id, targetType: z.string().max(30), targetId: id }),
]);

export type LinkPayload = z.infer<typeof linkPayloadSchema>;

export const LINK_KINDS = linkPayloadSchema.options.map(
  (option) => option.shape.kind.value,
) as LinkPayload["kind"][];
