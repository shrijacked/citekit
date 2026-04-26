import { describe, expect, it } from 'vitest';
import { checkFormatting, loadVenueRulePack } from '../src/core/formatting.js';
import type { ReferenceRecord, VenueRulePack } from '../src/types.js';

const ieee: VenueRulePack = {
  id: 'ieee',
  label: 'IEEE',
  rules: {
    requireDoi: true,
    requireYear: true,
    referenceOrder: 'citation_order'
  }
};

describe('checkFormatting', () => {
  it('flags missing required DOI and year fields', () => {
    const references: ReferenceRecord[] = [
      {
        id: 'missing',
        title: 'Missing Metadata',
        authors: ['Ada Smith']
      }
    ];

    const findings = checkFormatting(references, ieee);

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'requireDoi', verdict: 'fail' }),
        expect.objectContaining({ rule: 'requireYear', verdict: 'fail' })
      ])
    );
  });

  it('loads packaged venue rule packs', async () => {
    const rulePack = await loadVenueRulePack('neurips');

    expect(rulePack).toMatchObject({
      id: 'neurips',
      label: 'NeurIPS',
      cslStyle: 'harvard1',
      rules: {
        referenceOrder: 'alphabetical'
      }
    });
  });
});
