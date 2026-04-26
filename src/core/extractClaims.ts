import { readFile } from 'node:fs/promises';
import type { ClaimCitationLink } from '../types.js';
import { normalizeWhitespace } from './text.js';

const MARKDOWN_CITATION = /\[([^\]]*@[-A-Za-z0-9_:.]+[^\]]*)\]/g;
const LATEX_CITATION = /\\cite[a-zA-Z*]*\s*(?:\[[^\]]*\]\s*){0,2}\{([^}]+)\}/g;
const KEY_IN_MARKDOWN = /@([-A-Za-z0-9_:.]+)/g;

export async function extractClaimsFromFile(
  manuscriptPath: string
): Promise<ClaimCitationLink[]> {
  const text = await readFile(manuscriptPath, 'utf8');
  return extractClaims(text, manuscriptPath);
}

export function extractClaims(
  manuscript: string,
  manuscriptPath = '<memory>'
): ClaimCitationLink[] {
  const links: ClaimCitationLink[] = [];
  const lines = manuscript.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!lineIncludesCitation(line)) {
      continue;
    }

    for (const sentence of splitSentences(line)) {
      const citationKeys = extractCitationKeys(sentence);
      if (citationKeys.length === 0) {
        continue;
      }

      links.push({
        id: `C${links.length + 1}`,
        claim: cleanClaim(sentence),
        citationKeys,
        source: {
          path: manuscriptPath,
          line: index + 1
        }
      });
    }
  }

  return links;
}

export function extractCitationKeys(value: string): string[] {
  const keys = new Set<string>();
  MARKDOWN_CITATION.lastIndex = 0;
  LATEX_CITATION.lastIndex = 0;
  KEY_IN_MARKDOWN.lastIndex = 0;

  for (const match of value.matchAll(MARKDOWN_CITATION)) {
    KEY_IN_MARKDOWN.lastIndex = 0;
    for (const keyMatch of match[1].matchAll(KEY_IN_MARKDOWN)) {
      keys.add(keyMatch[1]);
    }
  }

  for (const match of value.matchAll(LATEX_CITATION)) {
    for (const key of match[1].split(',')) {
      const clean = key.trim();
      if (clean) {
        keys.add(clean);
      }
    }
  }

  return [...keys];
}

function lineIncludesCitation(line: string): boolean {
  MARKDOWN_CITATION.lastIndex = 0;
  LATEX_CITATION.lastIndex = 0;
  return MARKDOWN_CITATION.test(line) || LATEX_CITATION.test(line);
}

function splitSentences(line: string): string[] {
  return line
    .split(/(?<=[.!?])\s+(?=[A-Z0-9\\[])/)
    .map(normalizeWhitespace)
    .filter(Boolean);
}

function cleanClaim(sentence: string): string {
  return normalizeWhitespace(
    sentence
      .replace(MARKDOWN_CITATION, '')
      .replace(LATEX_CITATION, '')
      .replace(/\s+([,.;:!?])/g, '$1')
  );
}
