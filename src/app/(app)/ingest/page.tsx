import { requireUser } from "@/lib/auth";

export const metadata = { title: "Ingest" };

// Placeholder — replaced by the full queue + review UI in phase 4.
export default async function IngestPage() {
  await requireUser();
  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 font-display text-3xl font-bold tracking-tight">INGEST</h1>
      <p className="text-sm text-muted">The ingest pipeline is being assembled — parsing is live; review arrives in the next phase.</p>
    </div>
  );
}
