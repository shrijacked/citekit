import { describe, expect, it } from 'vitest';
import {
  checkFormatting,
  loadVenueRulePack,
  orderReferencesForVenue
} from '../src/core/formatting.js';
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

  it('orders references by first citation for numeric venues', () => {
    const references: ReferenceRecord[] = [
      {
        id: 'doe2021',
        title: 'Large Language Models Always Cite Accurately',
        authors: ['Jane Doe'],
        year: 2021
      },
      {
        id: 'smith2020',
        title: 'Neural Citation Audits Improve Reference Accuracy',
        authors: ['Ada Smith'],
        year: 2020
      }
    ];

    const ordered = orderReferencesForVenue(references, ieee, [
      {
        id: 'C1',
        claim: 'Neural citation audits improve reference accuracy.',
        citationKeys: ['smith2020'],
        source: { path: 'paper.md', line: 1 }
      },
      {
        id: 'C2',
        claim: 'Large language models always cite accurately.',
        citationKeys: ['doe2021'],
        source: { path: 'paper.md', line: 2 }
      }
    ]);

    expect(ordered.map((reference) => reference.id)).toEqual([
      'smith2020',
      'doe2021'
    ]);
  });

  it('orders references alphabetically for author-year venues', () => {
    const references: ReferenceRecord[] = [
      {
        id: 'smith2020',
        title: 'Neural Citation Audits Improve Reference Accuracy',
        authors: ['Ada Smith'],
        year: 2020
      },
      {
        id: 'doe2021',
        title: 'Large Language Models Always Cite Accurately',
        authors: ['Jane Doe'],
        year: 2021
      }
    ];

    const ordered = orderReferencesForVenue(references, {
      id: 'alpha',
      label: 'Alphabetical',
      rules: { referenceOrder: 'alphabetical' }
    });

    expect(ordered.map((reference) => reference.id)).toEqual([
      'doe2021',
      'smith2020'
    ]);
  });
});
