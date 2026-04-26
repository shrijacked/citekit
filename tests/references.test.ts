import { describe, expect, it } from 'vitest';
import { parseBibtex } from '../src/core/references.js';

describe('parseBibtex', () => {
  it('normalizes core BibTeX metadata', () => {
    const [record] = parseBibtex(`@article{smith2020,
      title = {Neural Citation Audits Improve Reference Accuracy},
      author = {Smith, Ada and Kumar, Ravi},
      journal = {Journal of Verifiable Research},
      year = {2020},
      doi = {https://doi.org/10.1000/CiteKit.1}
    }`);

    expect(record).toMatchObject({
      id: 'smith2020',
      title: 'Neural Citation Audits Improve Reference Accuracy',
      authors: ['Smith, Ada', 'Kumar, Ravi'],
      venue: 'Journal of Verifiable Research',
      year: 2020,
      doi: '10.1000/citekit.1'
    });
  });
});
