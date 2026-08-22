import { db } from "@/lib/db";
import { Section } from "@/components/ui";
import { UserAdmin } from "@/components/admin/user-admin";

export const metadata = { title: "Admin" };

export default async function AdminPage() {
  const [users, counts] = await Promise.all([
    db.user.findMany({ orderBy: { createdAt: "asc" } }),
    Promise.all([
      db.creator.count({ where: { archived: false } }),
      db.project.count({ where: { archived: false } }),
      db.organization.count({ where: { archived: false } }),
      db.format.count({ where: { archived: false } }),
      db.opportunity.count({ where: { archived: false } }),
      db.entity.count(),
      db.industryPerson.count({ where: { archived: false } }),
      db.auditLog.count(),
    ]),
  ]);
  const [creators, projects, orgs, formats, opps, entities, people, audits] = counts;

  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 font-display text-3xl font-bold tracking-tight">ADMIN</h1>

      <Section title="Database">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Talent", creators],
            ["Projects", projects],
            ["Organizations", orgs],
            ["Formats", formats],
            ["Opportunities", opps],
            ["Entities", entities],
            ["Industry People", people],
            ["Audit Entries", audits],
          ].map(([label, n]) => (
            <div key={label} className="card px-3 py-2.5 text-center">
              <div className="font-display text-xl font-bold">{n}</div>
              <div className="text-xs text-muted">{label}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Users">
        <UserAdmin
          users={users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role }))}
        />
      </Section>
    </div>
  );
}
