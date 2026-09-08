import type { Prisma } from "@prisma/client";

// Match each word somewhere in a record or its direct relationships. The
// directory and global search use the same definitions and live records.
export const searchWords = (q: string) => [...new Set(q.trim().slice(0, 200).split(/\s+/).filter(Boolean))].slice(0, 12);
const contains = (word: string) => ({ contains: word, mode: "insensitive" as const });
export function creatorSearch(q: string): Prisma.CreatorWhereInput {
  return { AND: searchWords(q).map((word) => { const c = contains(word); return { OR: [
    { name: c }, { aliases: { has: word } }, { headline: c }, { miniBio: c }, { digitalSummary: c }, { internalNotes: c },
    { socialProfiles: { some: { handle: c } } },
    { entityLinks: { some: { entity: { name: c } } } },
    { credits: { some: { project: { archived: false, title: c } } } },
    { formats: { some: { format: { archived: false, title: c } } } },
    { organizations: { some: { organization: { archived: false, name: c } } } },
    { people: { some: { person: { archived: false, name: c } } } },
  ] }; }) };
}
export function projectSearch(q: string): Prisma.ProjectWhereInput {
  return { AND: searchWords(q).map((word) => { const c = contains(word); return { OR: [
    { title: c }, { aliases: { has: word } }, { logline: c }, { description: c }, { internalNotes: c },
    { credits: { some: { creator: { archived: false, name: c } } } },
    { organizations: { some: { organization: { archived: false, name: c } } } },
    { entityLinks: { some: { entity: { name: c } } } },
  ] }; }) };
}
export function formatSearch(q: string): Prisma.FormatWhereInput {
  return { AND: searchWords(q).map((word) => { const c = contains(word); return { OR: [
    { title: c }, { logline: c }, { description: c }, { notes: c }, { targetPlatform: c },
    { creators: { some: { creator: { archived: false, name: c } } } },
    { organizations: { some: { organization: { archived: false, name: c } } } },
    { entityLinks: { some: { entity: { name: c } } } },
  ] }; }) };
}
export function organizationSearch(q: string): Prisma.OrganizationWhereInput {
  return { AND: searchWords(q).map((word) => { const c = contains(word); return { OR: [
    { name: c }, { aliases: { has: word } }, { description: c }, { location: c }, { internalNotes: c },
    { people: { some: { person: { archived: false, name: c } } } },
    { creators: { some: { creator: { archived: false, name: c } } } },
    { projects: { some: { project: { archived: false, title: c } } } },
  ] }; }) };
}
export function personSearch(q: string): Prisma.IndustryPersonWhereInput {
  return { AND: searchWords(q).map((word) => { const c = contains(word); return { OR: [
    { name: c }, { title: c }, { email: c }, { notes: c }, { assistantName: c },
    { organizations: { some: { organization: { archived: false, name: c } } } },
    { creators: { some: { creator: { archived: false, name: c } } } },
  ] }; }) };
}
export function opportunitySearch(q: string): Prisma.OpportunityWhereInput {
  return { AND: searchWords(q).map((word) => { const c = contains(word); return { OR: [
    { title: c }, { description: c }, { notes: c }, { audienceRequirements: c }, { platformRequirements: c },
    { creators: { some: { creator: { archived: false, name: c } } } },
    { organizations: { some: { organization: { archived: false, name: c } } } },
    { entityLinks: { some: { entity: { name: c } } } },
  ] }; }) };
}
export function channelSearch(q: string): Prisma.ChannelWhereInput {
  return { AND: searchWords(q).map((word) => { const c = contains(word); return { OR: [
    { name: c }, { handle: c }, { premise: c }, { notes: c },
    { creator: { archived: false, name: c } }, { ideas: { some: { title: c } } },
    { organizations: { some: { organization: { archived: false, name: c } } } },
  ] }; }) };
}
