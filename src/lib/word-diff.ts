// Word-level diff (LCS) for before/after review cards. Pure and client-safe.

export type DiffSegment = { text: string; type: "same" | "added" | "removed" };

export function wordDiff(before: string, after: string): DiffSegment[] {
  const a = before.split(/(\s+)/).filter((t) => t.length);
  const b = after.split(/(\s+)/).filter((t) => t.length);
  const m = a.length;
  const n = b.length;
  if (m * n > 400_000) {
    // Too large for LCS — fall back to whole-field replacement
    return [
      { text: before, type: "removed" },
      { text: " ", type: "same" },
      { text: after, type: "added" },
    ];
  }

  // LCS table
  const dp: Uint32Array[] = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const segments: DiffSegment[] = [];
  const push = (text: string, type: DiffSegment["type"]) => {
    const last = segments[segments.length - 1];
    if (last && last.type === type) last.text += text;
    else segments.push({ text, type });
  };

  let i = 0, j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      push(a[i], "same");
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push(a[i], "removed");
      i++;
    } else {
      push(b[j], "added");
      j++;
    }
  }
  while (i < m) push(a[i++], "removed");
  while (j < n) push(b[j++], "added");
  return segments;
}
