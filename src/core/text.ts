const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'have',
  'in',
  'into',
  'is',
  'it',
  'its',
  'of',
  'on',
  'or',
  'that',
  'the',
  'their',
  'this',
  'to',
  'was',
  'were',
  'with'
]);

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function normalizeDoi(doi?: string): string | undefined {
  if (!doi) {
    return undefined;
  }

  return doi
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .toLowerCase();
}

export function normalizeTitle(value?: string): string {
  return normalizeWhitespace(value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '');
}

export function tokenize(value: string): string[] {
  return normalizeTitle(value)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

export function uniqueTokens(value: string): Set<string> {
  return new Set(tokenize(value));
}

export function jaccardSimilarity(left: string, right: string): number {
  const a = uniqueTokens(left);
  const b = uniqueTokens(right);

  if (a.size === 0 || b.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) {
      intersection += 1;
    }
  }

  return intersection / (a.size + b.size - intersection);
}

export function authorLastName(author: string): string {
  const trimmed = author.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.includes(',')) {
    return normalizeTitle(trimmed.split(',')[0]);
  }

  const parts = trimmed.split(/\s+/);
  return normalizeTitle(parts[parts.length - 1]);
}

export function authorOverlap(left: string[], right: string[]): number {
  const leftNames = new Set(left.map(authorLastName).filter(Boolean));
  const rightNames = new Set(right.map(authorLastName).filter(Boolean));
  if (leftNames.size === 0 || rightNames.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const name of leftNames) {
    if (rightNames.has(name)) {
      intersection += 1;
    }
  }

  return intersection / Math.max(leftNames.size, rightNames.size);
}

export function slugify(value: string): string {
  return normalizeTitle(value).replace(/\s+/g, '-').slice(0, 80);
}

export function reconstructOpenAlexAbstract(
  invertedIndex: unknown
): string | undefined {
  if (
    !invertedIndex ||
    typeof invertedIndex !== 'object' ||
    Array.isArray(invertedIndex)
  ) {
    return undefined;
  }

  const positions: Array<[number, string]> = [];
  for (const [word, indexes] of Object.entries(
    invertedIndex as Record<string, unknown>
  )) {
    if (!Array.isArray(indexes)) {
      continue;
    }
    for (const index of indexes) {
      if (typeof index === 'number') {
        positions.push([index, word]);
      }
    }
  }

  if (positions.length === 0) {
    return undefined;
  }

  return positions
    .sort(([a], [b]) => a - b)
    .map(([, word]) => word)
    .join(' ');
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
