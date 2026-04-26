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
  const normalized = manuscript.replace(/\r\n/g, '\n');

  for (const paragraph of splitParagraphs(normalized)) {
    if (!textIncludesCitation(paragraph.text)) {
      continue;
    }

    for (const sentence of splitSentences(paragraph.text)) {
      const citationKeys = extractCitationKeys(sentence);
      if (citationKeys.length === 0) {
        continue;
      }

      const sentenceOffset = paragraph.text.indexOf(sentence);
      links.push({
        id: `C${links.length + 1}`,
        claim: cleanClaim(sentence),
        citationKeys,
        source: {
          path: manuscriptPath,
          line:
            paragraph.startLine +
            countNewlines(paragraph.text.slice(0, Math.max(0, sentenceOffset)))
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

function textIncludesCitation(line: string): boolean {
  MARKDOWN_CITATION.lastIndex = 0;
  LATEX_CITATION.lastIndex = 0;
  return MARKDOWN_CITATION.test(line) || LATEX_CITATION.test(line);
}

function splitSentences(line: string): string[] {
  return line
    .replace(/\n+/g, ' ')
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

function splitParagraphs(manuscript: string): Array<{
  text: string;
  startLine: number;
}> {
  const paragraphs: Array<{ text: string; startLine: number }> = [];
  const blocks = manuscript.split(/(\n\s*\n)/);
  let line = 1;

  for (const block of blocks) {
    if (!block) {
      continue;
    }

    if (/^\n\s*\n$/.test(block)) {
      line += countNewlines(block);
      continue;
    }

    const text = block.trim();
    if (text) {
      const leadingNewlines = countLeadingNewlines(block);
      paragraphs.push({
        text,
        startLine: line + leadingNewlines
      });
    }
    line += countNewlines(block);
  }

  return paragraphs;
}

function countNewlines(value: string): number {
  return value.match(/\n/g)?.length ?? 0;
}

function countLeadingNewlines(value: string): number {
  return value.match(/^\n*/)?.[0].length ?? 0;
}
