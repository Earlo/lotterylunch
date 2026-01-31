export type MatchingInput = {
  participantIds: string[];
  groupSizeMin: number;
  groupSizeMax: number;
  recentMatches: string[][];
  seed: string;
};

export type MatchingResult = {
  matches: string[][];
  unmatched: string[];
  algorithmVersion: string;
};

const ALGORITHM_VERSION = 'v1.seeded-greedy';

function hashString(input: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return function rand() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithSeed<T>(items: T[], seed: string) {
  const rand = mulberry32(hashString(seed));
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function normalizePair(a: string, b: string) {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

function buildRecentPairSet(recentMatches: string[][]) {
  const pairs = new Set<string>();
  for (const members of recentMatches) {
    for (let i = 0; i < members.length; i += 1) {
      for (let j = i + 1; j < members.length; j += 1) {
        pairs.add(normalizePair(members[i], members[j]));
      }
    }
  }
  return pairs;
}

function hasRecentConflict(group: string[], recentPairs: Set<string>) {
  for (let i = 0; i < group.length; i += 1) {
    for (let j = i + 1; j < group.length; j += 1) {
      if (recentPairs.has(normalizePair(group[i], group[j]))) {
        return true;
      }
    }
  }
  return false;
}

function chunkGreedy(ids: string[], minSize: number, maxSize: number) {
  const groups: string[][] = [];
  let idx = 0;
  while (idx + minSize <= ids.length) {
    groups.push(ids.slice(idx, idx + minSize));
    idx += minSize;
  }

  const remainder = ids.slice(idx);
  if (remainder.length === 0) return { groups, remainder: [] as string[] };

  // Distribute remainder into existing groups up to maxSize.
  const remaining = [...remainder];
  let g = 0;
  while (remaining.length > 0 && groups.length > 0) {
    if (groups[g].length < maxSize) {
      const next = remaining.shift();
      if (next) groups[g].push(next);
    }
    g = (g + 1) % groups.length;

    const allFull = groups.every((group) => group.length >= maxSize);
    if (allFull) break;
  }

  return { groups, remainder: remaining };
}

export function createMatches(input: MatchingInput): MatchingResult {
  const minSize = Math.max(2, Math.min(input.groupSizeMin, input.groupSizeMax));
  const maxSize = Math.max(minSize, input.groupSizeMax);
  const recentPairs = buildRecentPairSet(input.recentMatches);

  const baseSeed = `${input.seed}:${input.participantIds.length}`;
  const attempts = 6;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const shuffled = shuffleWithSeed(input.participantIds, `${baseSeed}:${attempt}`);
    const { groups, remainder } = chunkGreedy(shuffled, minSize, maxSize);

    const conflicted = groups.some((group) => hasRecentConflict(group, recentPairs));
    if (!conflicted) {
      return {
        matches: groups,
        unmatched: remainder,
        algorithmVersion: ALGORITHM_VERSION,
      };
    }
  }

  // Fall back to best-effort final attempt even if conflicts remain.
  const shuffled = shuffleWithSeed(input.participantIds, `${baseSeed}:fallback`);
  const { groups, remainder } = chunkGreedy(shuffled, minSize, maxSize);

  return {
    matches: groups,
    unmatched: remainder,
    algorithmVersion: ALGORITHM_VERSION,
  };
}
