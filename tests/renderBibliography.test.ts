import { describe, expect, it } from 'vitest';
import { renderBibliography } from '../src/core/renderBibliography.js';
import type { ReferenceRecord } from '../src/types.js';

const references: ReferenceRecord[] = [
  {
    id: 'smith2020',
    title: 'Neural Citation Audits Improve Reference Accuracy',
    authors: ['Ada Smith', 'Ravi Kumar'],
    year: 2020,
    venue: 'Journal of Verifiable Research',
    doi: '10.1000/citekit.1'
  }
];

describe('renderBibliography', () => {
  it('loads packaged CSL styles instead of falling back to APA', async () => {
    const bibliography = await renderBibliography(references, 'ieee');

    expect(bibliography.style).toBe('citekit-ieee');
    expect(bibliography.entries[0]).toContain('[1]');
    expect(bibliography.entries[0]).toContain(
      'Neural Citation Audits Improve Reference Accuracy'
    );
  });

  it('resolves venue aliases to packaged CSL styles', async () => {
    const bibliography = await renderBibliography(references, 'acm-sigconf');

    expect(bibliography.style).toBe('citekit-acm-sig-proceedings');
    expect(bibliography.entries[0]).toContain(
      'Neural Citation Audits Improve Reference Accuracy'
    );
  });
});
