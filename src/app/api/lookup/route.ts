import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { labelFor } from "@/lib/taxonomy";

export type LookupItem = { id: string; name: string; sub?: string };

// Typeahead lookups for relationship pickers.
// ?type=creator|project|organization|format|person|entity|collection[&kind=interest][&q=...]
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json([], { status: 401 });

  const params = new URL(request.url).searchParams;
  const type = params.get("type") ?? "";
  const kind = params.get("kind") ?? undefined;
  const q = params.get("q")?.trim() ?? "";
  const contains = { contains: q, mode: "insensitive" as const };
  const take = 8;

  let items: LookupItem[] = [];
  switch (type) {
    case "creator": {
      const rows = await db.creator.findMany({
        where: { archived: false, ...(q ? { name: contains } : {}) },
        take,
        orderBy: { name: "asc" },
        select: { id: true, name: true, headline: true },
      });
      items = rows.map((r) => ({ id: r.id, name: r.name, sub: r.headline ?? undefined }));
      break;
    }
    case "project": {
      const rows = await db.project.findMany({
        where: { archived: false, ...(q ? { title: contains } : {}) },
        take,
        orderBy: { title: "asc" },
        select: { id: true, title: true, projectType: true },
      });
      items = rows.map((r) => ({ id: r.id, name: r.title, sub: labelFor(r.projectType) || undefined }));
      break;
    }
    case "organization": {
      const rows = await db.organization.findMany({
        where: { archived: false, ...(q ? { name: contains } : {}) },
        take,
        orderBy: { name: "asc" },
        select: { id: true, name: true, types: true },
      });
      items = rows.map((r) => ({ id: r.id, name: r.name, sub: r.types.map(labelFor).join(" · ") || undefined }));
      break;
    }
    case "format": {
      const rows = await db.format.findMany({
        where: { archived: false, ...(q ? { title: contains } : {}) },
        take,
        orderBy: { title: "asc" },
        select: { id: true, title: true, status: true },
      });
      items = rows.map((r) => ({ id: r.id, name: r.title, sub: labelFor(r.status) }));
      break;
    }
    case "person": {
      const rows = await db.industryPerson.findMany({
        where: { archived: false, ...(q ? { name: contains } : {}) },
        take,
        orderBy: { name: "asc" },
        select: { id: true, name: true, title: true },
      });
      items = rows.map((r) => ({ id: r.id, name: r.name, sub: r.title ?? undefined }));
      break;
    }
    case "entity": {
      const rows = await db.entity.findMany({
        where: { ...(kind ? { kind } : {}), ...(q ? { name: contains } : {}) },
        take: kind ? 12 : take,
        orderBy: { name: "asc" },
        select: { id: true, name: true, kind: true },
      });
      items = rows.map((r) => ({ id: r.id, name: r.name, sub: labelFor(r.kind) }));
      break;
    }
    case "collection": {
      const rows = await db.collection.findMany({
        where: q ? { name: contains } : {},
        take,
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
      items = rows.map((r) => ({ id: r.id, name: r.name }));
      break;
    }
    default:
      return NextResponse.json({ error: "unknown type" }, { status: 400 });
  }

  return NextResponse.json(items);
}
