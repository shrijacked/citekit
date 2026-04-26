import type { ReferenceRecord, RenderedBibliography } from '../types.js';
import { referenceToCslItem } from './references.js';

export async function renderBibliography(
  references: ReferenceRecord[],
  style: string
): Promise<RenderedBibliography> {
  const citationJsResult = await tryRenderWithCitationJs(references, style);
  if (citationJsResult) {
    return {
      style,
      entries: splitRenderedBibliography(citationJsResult)
    };
  }

  return {
    style,
    entries: references.map((reference, index) =>
      renderFallbackReference(reference, index + 1, style)
    )
  };
}

function splitRenderedBibliography(value: string): string[] {
  return value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function tryRenderWithCitationJs(
  references: ReferenceRecord[],
  style: string
): Promise<string | undefined> {
  try {
    await import('@citation-js/plugin-csl');
    const module = (await import('@citation-js/core')) as {
      Cite: new (input: unknown[]) => {
        format: (
          kind: 'bibliography',
          options: {
            format: 'text';
            template: string;
            lang: string;
          }
        ) => string;
      };
    };
    const cite = new module.Cite(references.map(referenceToCslItem));
    return cite.format('bibliography', {
      format: 'text',
      template: normalizeStyleTemplate(style),
      lang: 'en-US'
    });
  } catch {
    return undefined;
  }
}

function normalizeStyleTemplate(style: string): string {
  const aliases: Record<string, string> = {
    ieee: 'ieee',
    nature: 'nature',
    acm: 'acm-sig-proceedings',
    'acm-sigconf': 'acm-sig-proceedings'
  };
  return aliases[style] ?? style;
}

function renderFallbackReference(
  reference: ReferenceRecord,
  index: number,
  style: string
): string {
  const authors = formatAuthors(reference.authors);
  const year = reference.year ? ` (${reference.year})` : '';
  const venue = reference.venue ? ` ${reference.venue}.` : '';
  const doi = reference.doi ? ` doi:${reference.doi}.` : '';
  const url = reference.url && !reference.doi ? ` ${reference.url}.` : '';

  if (style.toLowerCase().includes('ieee') || style.toLowerCase().includes('acm')) {
    return `[${index}] ${authors}, "${reference.title},"${venue}${year}${doi}${url}`;
  }

  return `${authors}${year}. ${reference.title}.${venue}${doi}${url}`;
}

function formatAuthors(authors: string[]): string {
  if (authors.length === 0) {
    return 'Unknown author';
  }
  if (authors.length === 1) {
    return authors[0];
  }
  if (authors.length === 2) {
    return `${authors[0]} and ${authors[1]}`;
  }
  return `${authors.slice(0, -1).join(', ')}, and ${authors.at(-1)}`;
}
