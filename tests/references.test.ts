import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseBibtex, loadReferences, parseRis } from '../src/core/references.js';

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

  it('normalizes core RIS metadata', () => {
    const [record] = parseRis(`TY  - JOUR
ID  - smith2020
TI  - Neural Citation Audits Improve Reference Accuracy
AU  - Smith, Ada
AU  - Kumar, Ravi
JO  - Journal of Verifiable Research
PY  - 2020
DO  - https://doi.org/10.1000/CiteKit.1
UR  - https://example.org/smith2020
ER  -`);

    expect(record).toMatchObject({
      id: 'smith2020',
      type: 'article-journal',
      title: 'Neural Citation Audits Improve Reference Accuracy',
      authors: ['Smith, Ada', 'Kumar, Ravi'],
      venue: 'Journal of Verifiable Research',
      year: 2020,
      doi: '10.1000/citekit.1',
      url: 'https://example.org/smith2020'
    });
  });

  it('loads .ris bibliography files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'citekit-ris-'));
    const path = join(dir, 'refs.ris');
    await writeFile(
      path,
      `TY  - CONF
TI  - Verifiable Citation Pipelines
AU  - Doe, Jane
T2  - Proceedings of Citation Systems
Y1  - 2024
DO  - 10.1000/citekit.3
ER  -`,
      'utf8'
    );

    await expect(loadReferences(path)).resolves.toEqual([
      expect.objectContaining({
        id: '10.1000/citekit.3',
        type: 'paper-conference',
        title: 'Verifiable Citation Pipelines',
        authors: ['Doe, Jane'],
        venue: 'Proceedings of Citation Systems',
        year: 2024,
        doi: '10.1000/citekit.3'
      })
    ]);
  });

  it('loads BibTeX macros, nested braces, escaped characters, and date fields', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'citekit-bibtex-edge-'));
    const path = join(dir, 'refs.bib');
    await writeFile(
      path,
      `@string{jvr = {Journal of Verifiable Research}}

@article{smith2024,
  title = {{Neural} Citation Audits \\& Reference {Integrity}},
  author = {Smith, Ada and {CiteKit Team}},
  journal = jvr,
  date = {2024-05},
  month = may,
  doi = {https://doi.org/10.1000/CiteKit.4}
}
`,
      'utf8'
    );

    const [record] = await loadReferences(path);

    expect(record).toMatchObject({
      id: 'smith2024',
      title: 'Neural Citation Audits & Reference Integrity',
      authors: ['Ada Smith', 'CiteKit Team'],
      venue: 'Journal of Verifiable Research',
      year: 2024,
      doi: '10.1000/citekit.4'
    });
  });
});
