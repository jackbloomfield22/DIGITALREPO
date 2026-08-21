export type CreatorCardVM = {
  id: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  headline: string | null;
  status: string;
  categories: { name: string; slug: string }[];
  basedIn: { name: string; slug: string } | null;
  audience: string;
  formatCount: number;
  projectCount: number;
  interests: { name: string; slug: string; kind: string }[];
  formats: { title: string; slug: string }[];
  projects: { title: string; slug: string }[];
  socials: { platform: string; label: string; followers: string }[];
  representation: string[];
  favorited: boolean;
  updated: string;
};

export type CreatorDetailVM = {
  id: string;
  slug: string;
  name: string;
  version: number;
  imageUrl: string | null;
  headline: string | null;
  status: string;
  age: number | null;
  miniBio: string | null;
  internalNotes: string | null;
  audience: string;
  categories: { id: string; name: string; slug: string }[];
  locations: { id: string; name: string; slug: string; relationship: string }[];
  interests: { id: string; name: string; slug: string }[];
  sports: { id: string; name: string; slug: string }[];
  socials: {
    id: string;
    platform: string;
    platformLabel: string;
    handle: string | null;
    url: string | null;
    followerCount: number | null;
  }[];
  formats: { id: string; title: string; slug: string; status: string }[];
  projects: { title: string; slug: string; roles: string[]; year: number | null }[];
  representation: { name: string; slug: string; relationship: string }[];
};
