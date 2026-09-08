import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { searchRepo } from "@/lib/repo-search";
import { queryCreators } from "@/lib/queries/talent";
const prefix = "ZZSearchReview";
const ids: string[] = [];
beforeAll(async () => {
  const org = await db.organization.create({ data: { name: `${prefix} Athletic Brand`, slug: `${prefix}-brand` } });
  const sport = await db.entity.create({ data: { kind: "sport", name: `${prefix} Basketball`, slug: `${prefix}-basketball` } });
  for (const [index, name] of ["Alpha", "Zulu"].entries()) {
    const c = await db.creator.create({ data: { name: `${prefix} ${name}`, slug: `${prefix}-${name}`, createdAt: new Date(2026, index, 1), miniBio: `${prefix} community cooking projects`, socialProfiles: { create: { platform: "youtube", followerCount: 400000 + index } }, entityLinks: { create: { entityId: sport.id, relationship: "plays" } }, organizations: { create: { organizationId: org.id, relationship: "brand_partner" } } } });
    ids.push(c.id);
  }
  await db.creator.create({ data: { name: `${prefix} Archived`, slug: `${prefix}-archived`, archived: true } });
  await db.channel.create({ data: { name: `${prefix} Studio`, slug: `${prefix}-studio`, creatorId: ids[0], premise: "Weekly athlete interviews" } });
});
afterAll(async () => {
  await db.channel.deleteMany({ where: { name: { startsWith: prefix } } });
  await db.creator.deleteMany({ where: { name: { startsWith: prefix } } });
  await db.organization.deleteMany({ where: { name: { startsWith: prefix } } });
  await db.entity.deleteMany({ where: { name: { startsWith: prefix } } });
});
describe("shared repo discovery", () => {
  it("finds talent by combined topics and a connected company", async () => {
    const result = await searchRepo(`${prefix} Basketball Brand`, { type: "creator" });
    expect(result.groups.find((g) => g.type === "creator")?.count).toBe(2);
    expect(result.groups.find((g) => g.type === "creator")?.items.map((i) => i.id).sort()).toEqual(ids.sort());
  });
  it("finds bios and channels and keeps the archive opt-in", async () => {
    const bios = await searchRepo(`${prefix} cooking`, { type: "creator" });
    expect(bios.groups.find((g) => g.type === "creator")?.count).toBe(2);
    const live = await searchRepo(prefix);
    expect(live.groups.find((g) => g.type === "creator")?.count).toBe(2);
    expect(live.groups.find((g) => g.type === "channel")?.count).toBe(1);
    const archive = await searchRepo(prefix, { archived: true });
    expect(archive.groups.find((g) => g.type === "creator")?.count).toBe(3);
  });
  it("keeps Recently Added ordering when filtering total audience", async () => {
    const result = await queryCreators({ q: prefix, entities: [], sort: "added", minFollowers: 300000, page: 1, view: "table" });
    expect(result.creators.map((c) => c.name)).toEqual([`${prefix} Zulu`, `${prefix} Alpha`]);
  });
  it("returns useful results rather than an empty oversized page", async () => {
    const result = await searchRepo(prefix, { type: "creator", page: 900 });
    expect(result.page).toBe(1); expect(result.pages).toBe(1);
    expect(result.groups.find((g) => g.type === "creator")?.items).toHaveLength(2);
  });
});
