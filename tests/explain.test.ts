import { describe, expect, it } from 'vitest';
import { explainClaim } from '../src/report/explain.js';
import type { CitationAuditReport } from '../src/types.js';

describe('explainClaim', () => {
  it('includes source location, reference status, evidence quotes, and fixes', () => {
    const report: CitationAuditReport = {
      generatedAt: '2026-04-27T00:00:00.000Z',
      summary: {
        references: {
          verified: 1,
          ambiguous: 0,
          not_found: 0,
          metadata_mismatch: 0
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
        style: 'ieee'
      },
      references: [
        {
          input: {
            id: 'smith2020',
            title: 'Reference Accuracy Study',
            authors: ['Ada Smith'],
            doi: '10.1000/example'
          },
          resolved: {
            id: 'smith2020',
            title: 'Reference Accuracy Study',
            authors: ['Ada Smith'],
            doi: '10.1000/example'
          },
          verdict: 'verified',
          source: 'fixture',
          confidence: 1,
          mismatches: [],
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
              line: 7
            }
          },
          verdict: 'contradicted',
          confidence: 0.91,
          supportingSpans: [],
          contradictedBy: [
            {
              id: 'E1',
              referenceId: 'smith2020',
              source: 'user_file',
              locator: 'paragraph 1',
              text: 'Generated references are not always accurate.'
            }
          ],
          message: 'Available evidence appears to contradict the cited claim.'
        }
      ],
      formatting: [],
      bibliography: {
        style: 'ieee',
        entries: []
      },
      findings: [
        {
          id: 'C1',
          severity: 'error',
          category: 'claim',
          verdict: 'contradicted',
          claimId: 'C1',
          message: 'Available evidence appears to contradict the cited claim.',
          suggestedFix: 'Change the claim or replace the citation.',
          proof: {
            evidenceSpanIds: ['E1'],
            evidenceQuotes: [
              {
                id: 'E1',
                source: 'user_file',
                locator: 'paragraph 1',
                text: 'Generated references are not always accurate.'
              }
            ]
          }
        }
      ]
    };

    const explanation = explainClaim(report, 'C1');

    expect(explanation).toContain('Source: paper.md:7');
    expect(explanation).toContain('- smith2020: verified via fixture');
    expect(explanation).toContain('DOI: 10.1000/example');
    expect(explanation).toContain('Fix: Change the claim or replace the citation.');
    expect(explanation).toContain(
      'E1 [user_file, paragraph 1]: Generated references are not always accurate.'
    );
  });
});
