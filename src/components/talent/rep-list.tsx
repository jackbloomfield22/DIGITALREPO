"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { addLink, removeLink, type LinkPayload } from "@/lib/actions/links";
import { useToast } from "@/components/toast";
import { labelFor } from "@/lib/taxonomy";

export type RepItem = {
  id: string;
  personId: string;
  relationship: string;
  current: boolean;
  start: string | null;
  end: string | null;
  person: {
    name: string;
    slug: string;
    email: string | null;
    phone: string | null;
    assistantName: string | null;
    assistantEmail: string | null;
    orgName: string | null;
  };
};

/**
 * Representation as a contact card list: who they are, where they work, how
 * to reach them, and whether the relationship is current. "Mark past" reuses
 * the creator_person upsert — same link, current flipped.
 */
export function RepList({ creatorId, reps, canEdit }: {
  creatorId: string;
  reps: RepItem[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const payloadFor = (rep: RepItem): LinkPayload =>
    ({ kind: "creator_person", creatorId, personId: rep.personId, relationship: rep.relationship }) as LinkPayload;

  const toggleCurrent = async (rep: RepItem) => {
    const res = await addLink({ ...payloadFor(rep), current: !rep.current } as LinkPayload);
    if (res.ok) {
      toast(rep.current ? `Marked ${rep.person.name} as past` : `Marked ${rep.person.name} as current`);
      router.refresh();
    } else toast(res.error, { tone: "error" });
  };

  const remove = async (rep: RepItem) => {
    const payload = payloadFor(rep);
    const res = await removeLink(payload);
    if (res.ok) {
      toast(`Removed ${rep.person.name}`, {
        undo: async () => {
          await addLink({ ...payload, current: rep.current } as LinkPayload);
          router.refresh();
        },
      });
      router.refresh();
    } else toast(res.error, { tone: "error" });
  };

  if (!reps.length) return null;

  return (
    <div className="mb-2 space-y-2">
      {reps.map((rep) => (
        <div key={rep.id} className={`card px-4 py-2.5 text-sm ${rep.current ? "" : "opacity-70"}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <div className="min-w-0">
              <span className="font-semibold">{labelFor(rep.relationship)}: </span>
              <Link href={`/people/${rep.person.slug}`} className="font-semibold hover:text-accent-deep hover:underline">
                {rep.person.name}
              </Link>
              {rep.person.orgName && <span className="text-muted"> — {rep.person.orgName}</span>}
              <span className="text-muted"> — {rep.current ? "current" : "past"}</span>
              {(rep.start || rep.end) && (
                <span className="text-xs text-muted"> ({[rep.start, rep.end].filter(Boolean).join(" – ")})</span>
              )}
            </div>
            {canEdit && (
              <span className="shrink-0 space-x-2 text-xs">
                <button className="text-muted hover:text-accent-deep hover:underline" onClick={() => toggleCurrent(rep)}>
                  {rep.current ? "Mark past" : "Mark current"}
                </button>
                <button aria-label={`Remove ${rep.person.name}`} className="text-muted hover:text-accent" onClick={() => remove(rep)}>
                  ×
                </button>
              </span>
            )}
          </div>
          {(rep.person.email || rep.person.phone || rep.person.assistantName || rep.person.assistantEmail) && (
            <div className="mt-0.5 text-xs text-muted">
              {rep.person.email && (
                <a href={`mailto:${rep.person.email}`} className="hover:text-accent-deep hover:underline">{rep.person.email}</a>
              )}
              {rep.person.phone && <span>{rep.person.email ? " · " : ""}{rep.person.phone}</span>}
              {(rep.person.assistantName || rep.person.assistantEmail) && (
                <span>
                  {(rep.person.email || rep.person.phone) ? " · " : ""}
                  asst: {rep.person.assistantName}
                  {rep.person.assistantEmail && (
                    <>
                      {rep.person.assistantName ? " — " : ""}
                      <a href={`mailto:${rep.person.assistantEmail}`} className="hover:text-accent-deep hover:underline">
                        {rep.person.assistantEmail}
                      </a>
                    </>
                  )}
                </span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
