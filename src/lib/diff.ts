export type DiffKind = 'same' | 'add' | 'del';

export interface DiffLine {
  kind: DiffKind;
  text: string;
}

const LCS_LIMIT = 25_000_000; // cells; above this we use a cheap fallback

/**
 * Line-level diff between two texts. Returns a list of operations:
 * - same: line identical in both
 * - del:  line present only in the previous snapshot
 * - add:  line present only in the new snapshot
 */
export function diffTexts(previous: string, current: string): DiffLine[] {
  const prev = previous.split('\n');
  const cur = current.split('\n');

  if (prev.length === 0) return cur.map((text) => ({ kind: 'add' as const, text }));
  if (cur.length === 0) return prev.map((text) => ({ kind: 'del' as const, text }));

  // Cheap path for large inputs where full LCS is too expensive.
  if (prev.length * cur.length > LCS_LIMIT) {
    return fallbackDiff(prev, cur);
  }

  return lcsDiff(prev, cur);
}

function lcsDiff(prev: string[], cur: string[]): DiffLine[] {
  const n = prev.length;
  const m = cur.length;

  // DP matrix (two rows) for LCS lengths.
  const dp = new Uint32Array((n + 1) * (m + 1));
  const idx = (i: number, j: number) => i * (m + 1) + j;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (prev[i - 1] === cur[j - 1]) {
        dp[idx(i, j)] = dp[idx(i - 1, j - 1)] + 1;
      } else {
        dp[idx(i, j)] = Math.max(dp[idx(i - 1, j)], dp[idx(i, j - 1)]);
      }
    }
  }

  const result: DiffLine[] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (prev[i - 1] === cur[j - 1]) {
      result.unshift({ kind: 'same', text: prev[i - 1] });
      i--;
      j--;
    } else if (dp[idx(i - 1, j)] >= dp[idx(i, j - 1)]) {
      result.unshift({ kind: 'del', text: prev[i - 1] });
      i--;
    } else {
      result.unshift({ kind: 'add', text: cur[j - 1] });
      j--;
    }
  }
  while (i > 0) {
    result.unshift({ kind: 'del', text: prev[i - 1] });
    i--;
  }
  while (j > 0) {
    result.unshift({ kind: 'add', text: cur[j - 1] });
    j--;
  }
  return result;
}

function fallbackDiff(prev: string[], cur: string[]): DiffLine[] {
  // Trim a common prefix and suffix, then mark the middle chunk.
  let start = 0;
  while (start < prev.length && start < cur.length && prev[start] === cur[start]) start++;

  let endPrev = prev.length - 1;
  let endCur = cur.length - 1;
  while (endPrev >= start && endCur >= start && prev[endPrev] === cur[endCur]) {
    endPrev--;
    endCur--;
  }

  const result: DiffLine[] = [];
  for (let i = 0; i < start; i++) result.push({ kind: 'same', text: prev[i] });
  for (let i = start; i <= endPrev; i++) result.push({ kind: 'del', text: prev[i] });
  for (let i = start; i <= endCur; i++) result.push({ kind: 'add', text: cur[i] });
  for (let i = endPrev + 1; i < prev.length; i++) result.push({ kind: 'same', text: prev[i] });
  return result;
}

/** Short summary counts used by the UI. */
export function diffStats(lines: DiffLine[]): { same: number; add: number; del: number } {
  const stats = { same: 0, add: 0, del: 0 };
  for (const line of lines) stats[line.kind] += 1;
  return stats;
}