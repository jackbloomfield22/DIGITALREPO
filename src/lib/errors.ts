// Errors we choose not to surface still get written down. A `.catch(ignore("…"))`
// says where it happened, so a silent failure is at least findable in the logs.

export const ignore = (context: string) => (e: unknown): void => {
  console.warn(`[${context}] ignored: ${e instanceof Error ? e.message : String(e)}`);
};
