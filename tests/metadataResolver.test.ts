import { describe, expect, it } from 'vitest';
import { resolveReference } from '../src/core/metadataResolver.js';
import { FixtureMetadataProvider } from '../src/providers/fixture.js';
import type { ReferenceRecord } from '../src/types.js';

const fixture = new FixtureMetadataProvider([
  {
    id: 'resolved',
    title: 'Correct Title',
    authors: ['Ada Smith'],
    year: 2024,
    doi: '10.1000/example'
  }
]);

describe('resolveReference', () => {
  it('verifies exact DOI metadata matches', async () => {
    const input: ReferenceRecord = {
      id: 'smith',
      title: 'Correct Title',
      authors: ['Smith, Ada'],
      year: 2024,
      doi: '10.1000/example'
    };

    await expect(resolveReference(input, [fixture])).resolves.toMatchObject({
      verdict: 'verified',
      confidence: 0.98
    });
  });

  it('flags metadata mismatches for real but incorrect references', async () => {
    const input: ReferenceRecord = {
      id: 'wrong',
      title: 'Wrong Title',
      authors: ['Smith, Ada'],
      year: 2024,
      doi: '10.1000/example'
    };

    const result = await resolveReference(input, [fixture]);

    expect(result.verdict).toBe('metadata_mismatch');
    expect(result.mismatches.map((mismatch) => mismatch.field)).toContain('title');
  });

  it('flags missing references as not found', async () => {
    const input: ReferenceRecord = {
      id: 'fake',
      title: 'Fake Paper',
      authors: ['No One'],
      year: 2024,
      doi: '10.9999/fake'
    };

    await expect(resolveReference(input, [fixture])).resolves.toMatchObject({
      verdict: 'not_found'
    });
  });
});
