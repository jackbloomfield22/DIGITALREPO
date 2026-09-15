export type NavItem = { href: string; label: string; description?: string; editor?: boolean; admin?: boolean; owner?: boolean; shortcut?: string };

/** The rail, top to bottom: Home, one item per record type, then the working sections. */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/talent", label: "Talent", description: "Creators, athletes & personalities", shortcut: "G T" },
  { href: "/projects", label: "Projects", description: "Existing shows & credits", shortcut: "G P" },
  { href: "/organizations", label: "Companies", description: "Buyers, brands, agencies & production companies", shortcut: "G C" },
  { href: "/formats", label: "Formats", description: "Our show concepts", shortcut: "G F" },
  { href: "/opportunities", label: "Opportunities", description: "Briefs, asks & open doors", shortcut: "G O" },
  { href: "/people", label: "Industry people", description: "Representatives & contacts" },
  { href: "/ingest", label: "Ingest", description: "Upload documents and emails; review what the reader proposes" },
  { href: "/archive", label: "Archive", description: "Everything that has gone quiet or been shelved — restorable any time" },
  { href: "/settings", label: "Settings" },
  { href: "/admin", label: "Admin", admin: true },
];
export const WORKSPACE_NAV: NavItem[] = [
  { href: "/development", label: "Development overview" },
  { href: "/dev-slate", label: "Development slate" },
  { href: "/youtube", label: "YouTube" },
  { href: "/digital", label: "Digital" },
  { href: "/calendar", label: "Sports calendar" },
  { href: "/hq", label: "My HQ", owner: true },
];
export const TOOLS_NAV: NavItem[] = [
  { href: "/explore", label: "Explore interests & topics" },
  { href: "/industry", label: "Industry overview" },
  { href: "/ai", label: "Ask AI" },
  { href: "/uploads", label: "Add information" },
  { href: "/attention", label: "Needs attention" },
  { href: "/activity", label: "Team activity" },
  { href: "/collections", label: "Collections & saved views" },
  { href: "/favorites", label: "Favorites" },
  { href: "/recent", label: "Recently viewed" },
];
/** Kept for the pages that still read groups (palette navigation, breadcrumb labels). */
export const NAV_GROUPS: { label: string; collapsed?: boolean; items: NavItem[] }[] = [
  { label: "Browse the Repo", items: PRIMARY_NAV },
  { label: "Workspaces", items: WORKSPACE_NAV },
  { label: "Research & tools", collapsed: true, items: TOOLS_NAV },
];
export const CREATE_ITEMS: NavItem[] = [
  { href: "/talent/new", label: "Add talent", editor: true },
  { href: "/projects/new", label: "Add project", editor: true },
  { href: "/organizations/new", label: "Add company", editor: true },
  { href: "/formats/new", label: "Add format", editor: true },
  { href: "/opportunities/new", label: "Add opportunity", editor: true },
  { href: "/people/new", label: "Add industry person", editor: true },
  { href: "/youtube/new", label: "Add YouTube channel", editor: true },
  { href: "/collections/new", label: "Create collection", editor: true },
];
export const PAGE_LINKS: NavItem[] = [
  { href: "/search", label: "Search the Repo" },
  ...PRIMARY_NAV, ...WORKSPACE_NAV, ...TOOLS_NAV,
  { href: "/youtube/channels", label: "YouTube channels" },
  { href: "/youtube/ideas", label: "YouTube ideas" },
  { href: "/youtube/talent", label: "YouTube talent" },
  { href: "/youtube/partners", label: "YouTube partners" },
  { href: "/youtube/playbook", label: "YouTube playbook" },
];
export function allowedNav(items: NavItem[], permissions: { isEditor?: boolean; isAdmin?: boolean; isOwner?: boolean }) {
  return items.filter((i) => (!i.editor || permissions.isEditor) && (!i.admin || permissions.isAdmin) && (!i.owner || permissions.isOwner));
}
export function isNavActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
export const DIRECTORY_PATHS = ["/talent", "/formats", "/projects", "/organizations", "/people", "/opportunities", "/search", "/archive", "/digital", "/youtube/channels"];
/** Section → where "create" goes, for the C key and the palette. */
export const CREATE_FOR_SECTION: Record<string, string> = {
  "/talent": "/talent/new", "/projects": "/projects/new", "/organizations": "/organizations/new", "/formats": "/formats/new",
  "/opportunities": "/opportunities/new", "/people": "/people/new", "/youtube": "/youtube/new", "/collections": "/collections/new",
};
