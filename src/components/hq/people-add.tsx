"use client";

import { useRouter } from "next/navigation";
import { ensureRelationship } from "@/lib/actions/hq";
import { PersonPicker } from "@/components/hq/pickers";

export function PeopleAdd() {
  const router = useRouter();
  return (
    <div className="card mb-4 p-4">
      <div className="overline mb-1">Add someone</div>
      <p className="mb-2 text-xs text-muted">Anyone in the Repo — industry people or talent. Someone not in the Repo yet is added there first (Industry → People → New), so the shared record and your private notes stay separate.</p>
      <PersonPicker autoFocus placeholder="Type a name…" onPick={async (p) => {
        if (p.relationshipId) return router.push(`/hq/people/${p.relationshipId}`);
        if (p.personType && p.personId) { const r = await ensureRelationship(p.personType, p.personId); if (r.ok) router.push(`/hq/people/${r.id}`); }
      }} />
    </div>
  );
}
