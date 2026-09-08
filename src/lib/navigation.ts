export type NavItem = { href: string; label: string; description?: string; editor?: boolean; admin?: boolean; owner?: boolean };
export const NAV_GROUPS: { label: string; collapsed?: boolean; items: NavItem[] }[] = [
  { label: "Browse the Repo", items: [
    { href: "/talent", label: "Talent", description: "Creators, athletes & personalities" },
    { href: "/formats", label: "Formats", description: "Our show concepts" },
    { href: "/projects", label: "Projects", description: "Existing shows & credits" },
    { href: "/organizations", label: "Organizations", description: "Companies, brands & buyers" },
    { href: "/people", label: "Industry people", description: "Representatives & contacts" },
  ] },
  { label: "Workspaces", items: [
    { href: "/development", label: "Development overview" },
    { href: "/opportunities", label: "Opportunities" },
    { href: "/dev-slate", label: "Development slate" },
    { href: "/youtube", label: "YouTube" },
    { href: "/digital", label: "Digital" },
    { href: "/calendar", label: "Sports calendar" },
    { href: "/hq", label: "My HQ", owner: true },
  ] },
  { label: "My lists", collapsed: true, items: [
    { href: "/collections", label: "Collections & saved views" },
    { href: "/favorites", label: "Favorites" },
    { href: "/recent", label: "Recently viewed" },
  ] },
  { label: "Research & tools", collapsed: true, items: [
    { href: "/explore", label: "Explore interests & topics" },
    { href: "/industry", label: "Industry overview" },
    { href: "/ai", label: "Ask AI" },
    { href: "/uploads", label: "Add information" },
    { href: "/ingest", label: "Review incoming info" },
    { href: "/archive", label: "Archive" },
    { href: "/attention", label: "Needs attention" },
    { href: "/activity", label: "Team activity" },
  ] },
];
export const CREATE_ITEMS: NavItem[] = [
  { href: "/talent/new", label: "Add talent", editor: true },
  { href: "/formats/new", label: "Add format", editor: true },
  { href: "/projects/new", label: "Add project", editor: true },
  { href: "/opportunities/new", label: "Add opportunity", editor: true },
  { href: "/organizations/new", label: "Add organization", editor: true },
  { href: "/people/new", label: "Add industry person", editor: true },
  { href: "/youtube/new", label: "Add YouTube channel", editor: true },
  { href: "/collections/new", label: "Create collection", editor: true },
];
export const PAGE_LINKS: NavItem[] = [
  { href: "/", label: "Home" }, { href: "/search", label: "Search the Repo" },
  ...NAV_GROUPS.flatMap((g) => g.items),
  { href: "/youtube/channels", label: "YouTube channels" },
  { href: "/youtube/ideas", label: "YouTube ideas" },
  { href: "/youtube/talent", label: "YouTube talent" },
  { href: "/youtube/partners", label: "YouTube partners" },
  { href: "/youtube/playbook", label: "YouTube playbook" },
  { href: "/admin", label: "Admin", admin: true }, { href: "/settings", label: "Settings" },
];
export function allowedNav(items: NavItem[], permissions: { isEditor?: boolean; isAdmin?: boolean; isOwner?: boolean }) {
  return items.filter((i) => (!i.editor || permissions.isEditor) && (!i.admin || permissions.isAdmin) && (!i.owner || permissions.isOwner));
}
export function isNavActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
export const DIRECTORY_PATHS = ["/talent", "/formats", "/projects", "/organizations", "/people", "/opportunities", "/search", "/archive", "/digital", "/youtube/channels"];
