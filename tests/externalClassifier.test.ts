import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import {
  createCommandClaimClassifier,
  parseCommandLine
} from '../src/core/externalClassifier.js';
import type {
  ClaimCitationLink,
  EvidenceSpan,
  ReferenceRecord
} from '../src/types.js';

const claim: ClaimCitationLink = {
  id: 'C1',
  claim: 'Neural citation audits improve reference accuracy [@smith2020].',
  citationKeys: ['smith2020'],
  source: { path: 'paper.md', line: 1 }
};

const reference: ReferenceRecord = {
  id: 'smith2020',
  title: 'Neural Citation Audits Improve Reference Accuracy',
  authors: ['Ada Smith'],
  year: 2020
};

const evidence: EvidenceSpan = {
  id: 'E1',
  referenceId: 'smith2020',
  text: 'Neural citation audits improve reference accuracy.',
  source: 'user_file'
};

describe('createCommandClaimClassifier', () => {
  it('passes retrieved evidence to a classifier command over stdin', async () => {
    const classifier = createCommandClaimClassifier(
      `node "${resolve('tests/fixtures/classifier-supported.mjs')}"`
    );

    const result = await classifier({
      claim,
      references: [reference],
      evidence: [evidence]
    });

    expect(result).toMatchObject({
      verdict: 'supported',
      confidence: 0.91,
      supportingSpanIds: ['E1']
    });
  });

  it('parses quoted command arguments without invoking a shell', () => {
    expect(
      parseCommandLine('node "path with spaces/classifier.mjs" --mode strict ""')
    ).toEqual(['node', 'path with spaces/classifier.mjs', '--mode', 'strict', '']);
  });
});
