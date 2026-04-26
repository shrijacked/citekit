import { describe, expect, it } from 'vitest';
import {
  verifyClaim,
  verifyClaimsWithClassifier
} from '../src/core/claimVerifier.js';
import type { ClaimCitationLink, EvidenceSpan, ReferenceRecord } from '../src/types.js';

const reference: ReferenceRecord = {
  id: 'smith2020',
  title: 'Neural Citation Audits Improve Reference Accuracy',
  authors: ['Ada Smith'],
  year: 2020,
  doi: '10.1000/citekit.1'
};

function claim(text: string): ClaimCitationLink {
  return {
    id: 'C1',
    claim: text,
    citationKeys: ['smith2020'],
    source: { path: 'paper.md', line: 1 }
  };
}

function span(text: string): EvidenceSpan {
  return {
    id: 'E1',
    referenceId: 'smith2020',
    text,
    source: 'user_file'
  };
}

describe('verifyClaim', () => {
  it('marks direct evidence as supported', () => {
    const result = verifyClaim(
      claim('Neural citation audits improve reference accuracy'),
      [reference],
      [span('Neural citation audits improve reference accuracy in final manuscripts.')]
    );

    expect(result.verdict).toBe('supported');
  });

  it('marks negated evidence as contradicted', () => {
    const result = verifyClaim(
      claim('Large language models always cite accurately'),
      [reference],
      [
        span(
          'Large language models do not always cite accurately, and generated references require verification.'
        )
      ]
    );

    expect(result.verdict).toBe('contradicted');
  });

  it('does not invent support when no evidence exists', () => {
    const result = verifyClaim(claim('Citation audits improve accuracy'), [reference], []);

    expect(result.verdict).toBe('unverifiable');
  });

  it('rejects classifier proof that does not cite retrieved evidence spans', async () => {
    const [result] = await verifyClaimsWithClassifier(
      [claim('Neural citation audits improve reference accuracy')],
      [
        {
          input: reference,
          resolved: reference,
          verdict: 'verified',
          confidence: 1,
          mismatches: [],
          evidence: []
        }
      ],
      [span('Neural citation audits improve reference accuracy.')],
      async () => ({
        verdict: 'supported',
        confidence: 1,
        supportingSpanIds: ['invented-span'],
        message: 'Looks supported.'
      })
    );

    expect(result.verdict).toBe('unverifiable');
    expect(result.message).toContain('without a valid retrieved evidence span');
  });
});
