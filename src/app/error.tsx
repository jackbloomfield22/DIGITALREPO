"use client";

// App-wide error boundary. The most common production trigger is the
// serverless database waking from idle — a retry almost always succeeds,
// and the user's session is preserved.
export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <div className="font-display text-2xl font-bold tracking-tight">4.4.FORTY REPO</div>
        <p className="mt-4 text-sm text-muted">
          Having trouble reaching the database — it may just be waking up. Your sign-in is
          safe; give it a second and try again.
        </p>
        <button className="btn btn-primary mt-5" onClick={() => reset()}>
          Try Again
        </button>
      </div>
    </div>
  );
}
