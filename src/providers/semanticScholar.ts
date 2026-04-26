import type { MetadataProvider, ReferenceRecord } from '../types.js';
import { normalizeDoi } from '../core/text.js';

type SemanticScholarPaper = {
  paperId?: string;
  title?: string;
  authors?: Array<{ name?: string }>;
  year?: number;
  venue?: string;
  externalIds?: {
    DOI?: string;
  };
  abstract?: string;
  url?: string;
};

const FIELDS =
  'paperId,title,authors,year,venue,externalIds,abstract,url';

export class SemanticScholarProvider implements MetadataProvider {
  readonly name = 'semantic_scholar' as const;

  constructor(
    private readonly options: {
      apiKey?: string;
      fetchImpl?: typeof fetch;
    } = {}
  ) {}

  async resolve(reference: ReferenceRecord): Promise<ReferenceRecord[]> {
    const fetcher = this.options.fetchImpl ?? fetch;
    const doi = normalizeDoi(reference.doi);
    const url = doi
      ? `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(
          doi
        )}?fields=${FIELDS}`
      : `https://api.semanticscholar.org/graph/v1/paper/search?limit=3&query=${encodeURIComponent(
          reference.title
        )}&fields=${FIELDS}`;

    const response = await fetcher(url, {
      headers: {
        Accept: 'application/json',
        ...(this.options.apiKey
          ? { 'x-api-key': this.options.apiKey }
          : undefined)
      }
    });
    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as
      | SemanticScholarPaper
      | { data?: SemanticScholarPaper[] };
    const papers = Array.isArray((payload as { data?: unknown[] }).data)
      ? ((payload as { data: SemanticScholarPaper[] }).data ?? [])
      : [payload as SemanticScholarPaper];

    return papers.map(mapSemanticScholarPaper);
  }
}

function mapSemanticScholarPaper(paper: SemanticScholarPaper): ReferenceRecord {
  return {
    id: paper.paperId ?? normalizeDoi(paper.externalIds?.DOI) ?? paper.title ?? 's2',
    type: 'article-journal',
    title: paper.title ?? '',
    authors: (paper.authors ?? [])
      .map((author) => author.name)
      .filter((name): name is string => Boolean(name)),
    year: paper.year,
    venue: paper.venue,
    doi: normalizeDoi(paper.externalIds?.DOI),
    url: paper.url,
    raw: paper.abstract ? { ...paper, abstract: paper.abstract } : paper
  };
}
