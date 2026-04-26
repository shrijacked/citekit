import type { MetadataProvider, ReferenceRecord } from '../types.js';
import {
  normalizeDoi,
  reconstructOpenAlexAbstract
} from '../core/text.js';

type OpenAlexWork = {
  id?: string;
  title?: string;
  display_name?: string;
  doi?: string;
  publication_year?: number;
  primary_location?: {
    source?: {
      display_name?: string;
    };
  };
  authorships?: Array<{
    author?: {
      display_name?: string;
    };
  }>;
  abstract_inverted_index?: unknown;
  content_url?: string;
  type?: string;
};

export class OpenAlexProvider implements MetadataProvider {
  readonly name = 'openalex' as const;

  constructor(
    private readonly options: {
      apiKey?: string;
      fetchImpl?: typeof fetch;
    } = {}
  ) {}

  async resolve(reference: ReferenceRecord): Promise<ReferenceRecord[]> {
    const fetcher = this.options.fetchImpl ?? fetch;
    const doi = normalizeDoi(reference.doi);
    const baseUrl = doi
      ? `https://api.openalex.org/works/doi:${encodeURIComponent(doi)}`
      : `https://api.openalex.org/works?per-page=3&search=${encodeURIComponent(
          reference.title
        )}`;
    const url = this.options.apiKey
      ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(
          this.options.apiKey
        )}`
      : baseUrl;

    const response = await fetcher(url, {
      headers: {
        Accept: 'application/json'
      }
    });
    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as
      | OpenAlexWork
      | { results?: OpenAlexWork[] };
    const works = Array.isArray((payload as { results?: unknown[] }).results)
      ? ((payload as { results: OpenAlexWork[] }).results ?? [])
      : [payload as OpenAlexWork];

    return works.map(mapOpenAlexWork);
  }
}

function mapOpenAlexWork(work: OpenAlexWork): ReferenceRecord {
  return {
    id: work.id ?? normalizeDoi(work.doi) ?? work.title ?? 'openalex',
    type: work.type,
    title: work.title ?? work.display_name ?? '',
    authors: (work.authorships ?? [])
      .map((authorship) => authorship.author?.display_name)
      .filter((name): name is string => Boolean(name)),
    year: work.publication_year,
    venue: work.primary_location?.source?.display_name,
    doi: normalizeDoi(work.doi),
    url: work.id,
    raw: {
      ...work,
      abstract: reconstructOpenAlexAbstract(work.abstract_inverted_index)
    }
  };
}
