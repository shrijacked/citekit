import { describe, expect, it, vi } from 'vitest';
import { CrossrefProvider } from '../src/providers/crossref.js';
import { OpenAlexProvider } from '../src/providers/openalex.js';
import { SemanticScholarProvider } from '../src/providers/semanticScholar.js';
import type { ReferenceRecord } from '../src/types.js';

const reference: ReferenceRecord = {
  id: 'smith2020',
  title: 'Neural Citation Audits Improve Reference Accuracy',
  authors: ['Ada Smith'],
  year: 2020,
  doi: '10.1000/citekit.1'
};

function fetchJson(payload: unknown): typeof fetch {
  return vi.fn(async () => ({
    ok: true,
    json: async () => payload
  })) as unknown as typeof fetch;
}

describe('metadata providers', () => {
  it('maps Crossref work metadata into ReferenceRecord', async () => {
    const fetchImpl = fetchJson({
      message: {
        title: ['Neural Citation Audits Improve Reference Accuracy'],
        author: [
          {
            given: 'Ada',
            family: 'Smith'
          }
        ],
        issued: {
          'date-parts': [[2020]]
        },
        'container-title': ['Journal of Verifiable Research'],
        DOI: '10.1000/CiteKit.1',
        URL: 'https://doi.org/10.1000/citekit.1',
        abstract: '<jats:p>Reference metadata can be verified.</jats:p>',
        type: 'journal-article'
      }
    });

    const provider = new CrossrefProvider({ fetchImpl, mailto: 'dev@example.com' });
    const [record] = await provider.resolve(reference);

    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('https://api.crossref.org/works/10.1000%2Fcitekit.1'),
      expect.any(Object)
    );
    expect(record).toMatchObject({
      title: 'Neural Citation Audits Improve Reference Accuracy',
      authors: ['Ada Smith'],
      year: 2020,
      venue: 'Journal of Verifiable Research',
      doi: '10.1000/citekit.1',
      type: 'journal-article'
    });
    expect(record.raw?.abstract).toBe('Reference metadata can be verified.');
  });

  it('maps OpenAlex work metadata and reconstructs inverted abstracts', async () => {
    const fetchImpl = fetchJson({
      id: 'https://openalex.org/W1',
      title: 'Neural Citation Audits Improve Reference Accuracy',
      doi: 'https://doi.org/10.1000/citekit.1',
      publication_year: 2020,
      primary_location: {
        source: {
          display_name: 'Journal of Verifiable Research'
        }
      },
      authorships: [
        {
          author: {
            display_name: 'Ada Smith'
          }
        }
      ],
      abstract_inverted_index: {
        Citation: [0],
        audits: [1],
        work: [2]
      },
      content_url: 'https://content.openalex.org/works/W1',
      type: 'article'
    });

    const provider = new OpenAlexProvider({ fetchImpl, apiKey: 'key' });
    const [record] = await provider.resolve(reference);

    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('api.openalex.org/works/doi:10.1000%2Fcitekit.1'),
      expect.any(Object)
    );
    expect(record).toMatchObject({
      id: 'https://openalex.org/W1',
      title: 'Neural Citation Audits Improve Reference Accuracy',
      authors: ['Ada Smith'],
      year: 2020,
      venue: 'Journal of Verifiable Research',
      doi: '10.1000/citekit.1'
    });
    expect(record.raw?.abstract).toBe('Citation audits work');
  });

  it('maps Semantic Scholar graph metadata into ReferenceRecord', async () => {
    const fetchImpl = fetchJson({
      paperId: 'S2-1',
      title: 'Neural Citation Audits Improve Reference Accuracy',
      authors: [{ name: 'Ada Smith' }],
      year: 2020,
      venue: 'Journal of Verifiable Research',
      externalIds: {
        DOI: '10.1000/CiteKit.1'
      },
      abstract: 'Citation audits check generated references.',
      url: 'https://semanticscholar.org/paper/S2-1'
    });

    const provider = new SemanticScholarProvider({ fetchImpl, apiKey: 'key' });
    const [record] = await provider.resolve(reference);

    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining(
        'api.semanticscholar.org/graph/v1/paper/DOI:10.1000%2Fcitekit.1'
      ),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'key'
        })
      })
    );
    expect(record).toMatchObject({
      id: 'S2-1',
      title: 'Neural Citation Audits Improve Reference Accuracy',
      authors: ['Ada Smith'],
      year: 2020,
      venue: 'Journal of Verifiable Research',
      doi: '10.1000/citekit.1',
      url: 'https://semanticscholar.org/paper/S2-1'
    });
    expect(record.raw?.abstract).toBe('Citation audits check generated references.');
  });
});
