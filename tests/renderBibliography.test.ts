import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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

  it('fails instead of silently falling back when a CSL style is unknown', async () => {
    await expect(
      renderBibliography(references, 'unknown-conference-style')
    ).rejects.toThrow('No CSL style template found');
  });

  it('loads a custom CSL file path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'citekit-custom-csl-'));
    const stylePath = join(dir, 'custom-nature.csl');
    await writeFile(
      stylePath,
      await readFile(resolve('styles/nature.csl'), 'utf8'),
      'utf8'
    );

    const bibliography = await renderBibliography(references, stylePath);

    expect(bibliography.style).toBe('citekit-custom-nature');
    expect(bibliography.entries[0]).toContain(
      'Neural Citation Audits Improve Reference Accuracy'
    );
  });

  it.each([
    ['ieee', 'citekit-ieee'],
    ['acm-sigconf', 'citekit-acm-sig-proceedings'],
    ['nature', 'citekit-nature']
  ])('renders a %s venue bibliography fixture', async (style, expectedTemplate) => {
    const bibliography = await renderBibliography(references, style);

    expect(bibliography.style).toBe(expectedTemplate);
    expect(bibliography.entries).toHaveLength(1);
    expect(bibliography.entries[0]).toContain(
      'Neural Citation Audits Improve Reference Accuracy'
    );
  });
});
