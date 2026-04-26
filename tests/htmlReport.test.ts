import { describe, expect, it } from 'vitest';
import { renderHtmlReport } from '../src/report/html.js';
import type { CitationAuditReport } from '../src/types.js';

describe('renderHtmlReport', () => {
  it('renders claim proof details and reference metadata tables', () => {
    const report: CitationAuditReport = {
      generatedAt: '2026-04-27T00:00:00.000Z',
      summary: {
        references: {
          verified: 0,
          ambiguous: 0,
          not_found: 0,
          metadata_mismatch: 1
        },
        claims: {
          supported: 0,
          weak_support: 0,
          contradicted: 1,
          unverifiable: 0
        },
        formatting: {
          pass: 0,
          warning: 0,
          fail: 0
        },
        exitCode: 1
      },
      inputs: {
        manuscriptPath: 'paper.md',
        bibliographyPath: 'refs.bib',
        style: 'ieee',
        venue: 'ieee'
      },
      references: [
        {
          input: {
            id: 'smith2020',
            title: 'Wrong Title',
            authors: ['Ada Smith'],
            doi: '10.1000/citekit.1'
          },
          resolved: {
            id: 'smith2020',
            title: 'Correct Title',
            authors: ['Ada Smith'],
            doi: '10.1000/citekit.1'
          },
          verdict: 'metadata_mismatch',
          source: 'fixture',
          confidence: 0.9,
          mismatches: [
            {
              field: 'title',
              expected: 'Wrong Title',
              actual: 'Correct Title',
              message: 'Title differs.'
            }
          ],
          evidence: []
        }
      ],
      claims: [
        {
          claim: {
            id: 'C1',
            claim: 'Generated references are always accurate.',
            citationKeys: ['smith2020'],
            source: {
              path: 'paper.md',
              line: 1
            }
          },
          verdict: 'contradicted',
          confidence: 0.8,
          supportingSpans: [],
          contradictedBy: [
            {
              id: 'E1',
              referenceId: 'smith2020',
              source: 'user_file',
              locator: 'paragraph 1, sentence window 1',
              text: 'Generated references are not always accurate.'
            }
          ],
          message: 'Available evidence appears to contradict the cited claim.'
        }
      ],
      formatting: [],
      bibliography: {
        style: 'ieee',
        entries: ['[1] Ada Smith, "Correct Title."']
      },
      findings: [
        {
          id: 'C1',
          severity: 'error',
          category: 'claim',
          verdict: 'contradicted',
          claimId: 'C1',
          message: 'Available evidence appears to contradict the cited claim.'
        }
      ]
    };

    const html = renderHtmlReport(report);

    expect(html).toContain('<details id="C1" class="proof contradicted" open>');
    expect(html).toContain('<h2>References</h2>');
    expect(html).toContain('paragraph 1, sentence window 1');
    expect(html).toContain('<a href="#C1">C1</a>');
  });
});
