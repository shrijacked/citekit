import { extname } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { ReferenceRecord } from '../types.js';
import { normalizeDoi, normalizeWhitespace } from './text.js';

type CslName = {
  family?: string;
  given?: string;
  literal?: string;
};

type CslItem = {
  id?: string;
  type?: string;
  title?: string;
  author?: CslName[];
  issued?: {
    'date-parts'?: number[][];
  };
  'container-title'?: string;
  DOI?: string;
  doi?: string;
  URL?: string;
  url?: string;
  abstract?: string;
  [key: string]: unknown;
};

export async function loadReferences(
  bibliographyPath: string
): Promise<ReferenceRecord[]> {
  const text = await readFile(bibliographyPath, 'utf8');
  const ext = extname(bibliographyPath).toLowerCase();

  if (ext === '.json') {
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error('CSL JSON bibliography must be an array of items.');
    }
    return parsed.map((item, index) =>
      cslItemToReference(item as CslItem, `ref-${index + 1}`)
    );
  }

  if (ext === '.bib' || ext === '.bibtex') {
    const citationJsRecords = await tryParseBibtexWithCitationJs(text);
    if (citationJsRecords.length > 0) {
      return citationJsRecords;
    }
    return parseBibtex(text);
  }

  throw new Error(
    `Unsupported bibliography format "${ext}". Use .bib, .bibtex, or CSL .json.`
  );
}

export function parseBibtex(input: string): ReferenceRecord[] {
  const entries: ReferenceRecord[] = [];
  const entryPattern = /@(\w+)\s*\{\s*([^,\s]+)\s*,/g;
  let match: RegExpExecArray | null;

  while ((match = entryPattern.exec(input)) !== null) {
    const type = match[1].toLowerCase();
    const id = match[2].trim();
    const bodyStart = entryPattern.lastIndex;
    const bodyEnd = findEntryEnd(input, bodyStart);
    const body = input.slice(bodyStart, bodyEnd);
    entryPattern.lastIndex = bodyEnd + 1;
    const fields = parseBibtexFields(body);

    entries.push({
      id,
      type,
      title: cleanBibtexValue(fields.title ?? ''),
      authors: parseAuthors(fields.author ?? fields.editor ?? ''),
      year: parseYear(fields.year ?? fields.date),
      venue: cleanBibtexValue(
        fields.journal ??
          fields.booktitle ??
          fields.publisher ??
          fields.school ??
          ''
      ),
      doi: normalizeDoi(cleanBibtexValue(fields.doi ?? '')),
      url: cleanBibtexValue(fields.url ?? ''),
      raw: fields
    });
  }

  return entries;
}

export function referenceToCslItem(reference: ReferenceRecord): CslItem {
  return {
    id: reference.id,
    type: reference.type ?? 'article-journal',
    title: reference.title,
    author: reference.authors.map((author) => {
      if (author.includes(',')) {
        const [family, given] = author.split(',', 2);
        return { family: family.trim(), given: given?.trim() };
      }
      const parts = author.trim().split(/\s+/);
      return {
        family: parts.at(-1),
        given: parts.slice(0, -1).join(' ')
      };
    }),
    issued: reference.year
      ? {
          'date-parts': [[reference.year]]
        }
      : undefined,
    'container-title': reference.venue,
    DOI: reference.doi,
    URL: reference.url
  };
}

export function cslItemToReference(
  item: CslItem,
  fallbackId: string
): ReferenceRecord {
  return {
    id: String(item.id ?? fallbackId),
    type: item.type,
    title: normalizeWhitespace(String(item.title ?? '')),
    authors: (item.author ?? []).map(formatCslName).filter(Boolean),
    year: item.issued?.['date-parts']?.[0]?.[0],
    venue:
      typeof item['container-title'] === 'string'
        ? item['container-title']
        : undefined,
    doi: normalizeDoi(String(item.DOI ?? item.doi ?? '')),
    url: typeof item.URL === 'string' ? item.URL : (item.url as string | undefined),
    raw: item
  };
}

async function tryParseBibtexWithCitationJs(
  input: string
): Promise<ReferenceRecord[]> {
  try {
    await import('@citation-js/plugin-bibtex');
    await import('@citation-js/plugin-csl');
    const module = (await import('@citation-js/core')) as {
      Cite: new (input: string) => { data: CslItem[] };
    };
    const cite = new module.Cite(input);
    return cite.data.map((item, index) =>
      cslItemToReference(item, `ref-${index + 1}`)
    );
  } catch {
    return [];
  }
}

function findEntryEnd(input: string, start: number): number {
  let depth = 1;
  let quote: '"' | null = null;

  for (let index = start; index < input.length; index += 1) {
    const char = input[index];
    if (quote) {
      if (char === quote && input[index - 1] !== '\\') {
        quote = null;
      }
      continue;
    }
    if (char === '"') {
      quote = char;
      continue;
    }
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return input.length;
}

function parseBibtexFields(body: string): Record<string, string> {
  const fields: Record<string, string> = {};
  let index = 0;

  while (index < body.length) {
    while (/[\s,]/.test(body[index] ?? '')) {
      index += 1;
    }

    const nameMatch = /^[A-Za-z][A-Za-z0-9_-]*/.exec(body.slice(index));
    if (!nameMatch) {
      break;
    }

    const name = nameMatch[0].toLowerCase();
    index += name.length;
    while (/\s/.test(body[index] ?? '')) {
      index += 1;
    }
    if (body[index] !== '=') {
      break;
    }
    index += 1;
    while (/\s/.test(body[index] ?? '')) {
      index += 1;
    }

    const { value, nextIndex } = readBibtexValue(body, index);
    fields[name] = value;
    index = nextIndex;
  }

  return fields;
}

function readBibtexValue(
  body: string,
  start: number
): { value: string; nextIndex: number } {
  const opener = body[start];
  if (opener === '{' || opener === '"') {
    const closer = opener === '{' ? '}' : '"';
    let depth = opener === '{' ? 1 : 0;
    let index = start + 1;

    for (; index < body.length; index += 1) {
      const char = body[index];
      if (opener === '{') {
        if (char === '{') {
          depth += 1;
        } else if (char === '}') {
          depth -= 1;
          if (depth === 0) {
            break;
          }
        }
      } else if (char === closer && body[index - 1] !== '\\') {
        break;
      }
    }

    return {
      value: body.slice(start + 1, index),
      nextIndex: index + 1
    };
  }

  const match = /^[^,\s}]+/.exec(body.slice(start));
  const value = match?.[0] ?? '';
  return {
    value,
    nextIndex: start + value.length
  };
}

function cleanBibtexValue(value: string): string {
  return normalizeWhitespace(
    value
      .replace(/[{}]/g, '')
      .replace(/\\"/g, '"')
      .replace(/\\&/g, '&')
      .replace(/--/g, '-')
  );
}

function parseAuthors(value: string): string[] {
  return cleanBibtexValue(value)
    .split(/\s+and\s+/i)
    .map((author) => author.trim())
    .filter(Boolean);
}

function parseYear(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }
  const match = /\d{4}/.exec(value);
  return match ? Number(match[0]) : undefined;
}

function formatCslName(name: CslName): string {
  if (name.literal) {
    return name.literal;
  }
  if (name.family && name.given) {
    return `${name.given} ${name.family}`;
  }
  return name.family ?? name.given ?? '';
}
