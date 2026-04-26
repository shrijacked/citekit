import type { MetadataProvider, ReferenceRecord } from '../types.js';
import { normalizeDoi } from '../core/text.js';

type CrossrefWork = {
  title?: string[];
  author?: Array<{ given?: string; family?: string; name?: string }>;
  issued?: { 'date-parts'?: number[][] };
  published?: { 'date-parts'?: number[][] };
  'container-title'?: string[];
  DOI?: string;
  URL?: string;
  abstract?: string;
  type?: string;
};

export class CrossrefProvider implements MetadataProvider {
  readonly name = 'crossref' as const;

  constructor(
    private readonly options: {
      mailto?: string;
      fetchImpl?: typeof fetch;
    } = {}
  ) {}

  async resolve(reference: ReferenceRecord): Promise<ReferenceRecord[]> {
    const fetcher = this.options.fetchImpl ?? fetch;
    const doi = normalizeDoi(reference.doi);
    const url = doi
      ? `https://api.crossref.org/works/${encodeURIComponent(doi)}`
      : `https://api.crossref.org/works?rows=3&query.bibliographic=${encodeURIComponent(
          reference.title
        )}`;
    const withMailto = this.options.mailto
      ? `${url}${url.includes('?') ? '&' : '?'}mailto=${encodeURIComponent(
          this.options.mailto
        )}`
      : url;

    const response = await fetcher(withMailto, {
      headers: {
        Accept: 'application/json'
      }
    });
    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as {
      message?: CrossrefWork | { items?: CrossrefWork[] };
    };
    const message = payload.message;
    const works = Array.isArray((message as { items?: unknown[] })?.items)
      ? ((message as { items: CrossrefWork[] }).items ?? [])
      : message
        ? [message as CrossrefWork]
        : [];

    return works.map(mapCrossrefWork);
  }
}

function mapCrossrefWork(work: CrossrefWork): ReferenceRecord {
  return {
    id: normalizeDoi(work.DOI) ?? work.URL ?? work.title?.[0] ?? 'crossref',
    type: work.type,
    title: work.title?.[0] ?? '',
    authors: (work.author ?? []).map((author) =>
      author.name
        ? author.name
        : [author.given, author.family].filter(Boolean).join(' ')
    ),
    year:
      work.issued?.['date-parts']?.[0]?.[0] ??
      work.published?.['date-parts']?.[0]?.[0],
    venue: work['container-title']?.[0],
    doi: normalizeDoi(work.DOI),
    url: work.URL,
    raw: {
      ...work,
      abstract: stripAbstract(work.abstract)
    }
  };
}

function stripAbstract(value?: string): string | undefined {
  return value?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
