import { readFile } from 'node:fs/promises';
import type { ClaimCitationLink } from '../types.js';
import { normalizeWhitespace } from './text.js';

const MARKDOWN_CITATION = /\[([^\]]*@[-A-Za-z0-9_:.]+[^\]]*)\]/g;
const NARRATIVE_MARKDOWN_CITATION =
  /(^|[\s([{;,:])(?:-)?@([-A-Za-z0-9_:.]+)/g;
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

    const flattened = flattenWithLineOffsets(paragraph.text);
    let searchStart = 0;

    for (const sentence of splitSentences(flattened.text)) {
      const citationKeys = extractCitationKeys(sentence);
      if (citationKeys.length === 0) {
        continue;
      }

      const sentenceOffset = flattened.text.indexOf(sentence, searchStart);
      searchStart =
        sentenceOffset >= 0 ? sentenceOffset + sentence.length : searchStart;

      links.push({
        id: `C${links.length + 1}`,
        claim: cleanClaim(sentence),
        citationKeys,
        source: {
          path: manuscriptPath,
          line:
            paragraph.startLine +
            (sentenceOffset >= 0 ? flattened.lineOffsets[sentenceOffset] : 0)
        }
      });
    }
  }

  return links;
}

export function extractCitationKeys(value: string): string[] {
  const keys = new Set<string>();
  MARKDOWN_CITATION.lastIndex = 0;
  NARRATIVE_MARKDOWN_CITATION.lastIndex = 0;
  LATEX_CITATION.lastIndex = 0;
  KEY_IN_MARKDOWN.lastIndex = 0;

  for (const match of value.matchAll(MARKDOWN_CITATION)) {
    KEY_IN_MARKDOWN.lastIndex = 0;
    for (const keyMatch of match[1].matchAll(KEY_IN_MARKDOWN)) {
      keys.add(keyMatch[1]);
    }
  }

  for (const match of value.matchAll(NARRATIVE_MARKDOWN_CITATION)) {
    keys.add(match[2]);
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
  NARRATIVE_MARKDOWN_CITATION.lastIndex = 0;
  LATEX_CITATION.lastIndex = 0;
  return (
    MARKDOWN_CITATION.test(line) ||
    NARRATIVE_MARKDOWN_CITATION.test(line) ||
    LATEX_CITATION.test(line)
  );
}

function splitSentences(line: string): string[] {
  const sentences: string[] = [];
  let start = 0;
  let squareDepth = 0;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '[') {
      squareDepth += 1;
    } else if (char === ']') {
      squareDepth = Math.max(0, squareDepth - 1);
    }

    if (!/[.!?]/.test(char) || squareDepth > 0) {
      continue;
    }

    const rest = line.slice(index + 1);
    const boundary = /^(\s+)(?=[A-Z0-9\\[])/.exec(rest);
    if (!boundary || isSentenceAbbreviation(line.slice(start, index + 1))) {
      continue;
    }

    sentences.push(line.slice(start, index + 1));
    start = index + 1 + boundary[1].length;
  }

  sentences.push(line.slice(start));
  return sentences.map(normalizeWhitespace).filter(Boolean);
}

function isSentenceAbbreviation(value: string): boolean {
  return /\b(?:p|pp|fig|eq|sec|vol|no)\.$/i.test(value.trim());
}

function cleanClaim(sentence: string): string {
  return normalizeWhitespace(
    sentence
      .replace(MARKDOWN_CITATION, '')
      .replace(NARRATIVE_MARKDOWN_CITATION, '$1')
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

function flattenWithLineOffsets(value: string): {
  text: string;
  lineOffsets: number[];
} {
  const chars: string[] = [];
  const lineOffsets: number[] = [];
  let lineOffset = 0;
  let previousWasSpace = false;

  for (const char of value) {
    if (char === '\n') {
      lineOffset += 1;
      pushCollapsedSpace(chars, lineOffsets, lineOffset, previousWasSpace);
      previousWasSpace = true;
      continue;
    }

    if (/\s/.test(char)) {
      pushCollapsedSpace(chars, lineOffsets, lineOffset, previousWasSpace);
      previousWasSpace = true;
      continue;
    }

    chars.push(char);
    lineOffsets.push(lineOffset);
    previousWasSpace = false;
  }

  return {
    text: chars.join(''),
    lineOffsets
  };
}

function pushCollapsedSpace(
  chars: string[],
  lineOffsets: number[],
  lineOffset: number,
  previousWasSpace: boolean
): void {
  if (previousWasSpace) {
    return;
  }
  chars.push(' ');
  lineOffsets.push(lineOffset);
}
