import type { UserRole } from "@/lib/taxonomy";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};

const ROLE_RANK: Record<UserRole, number> = { VIEWER: 0, EDITOR: 1, ADMIN: 2 };

export function hasRole(user: SessionUser | null, role: UserRole): boolean {
  if (!user) return false;
  return ROLE_RANK[user.role] >= ROLE_RANK[role];
}
