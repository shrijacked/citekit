import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadEvidenceStore } from '../src/core/evidenceStore.js';
import type { ReferenceRecord } from '../src/types.js';

const reference: ReferenceRecord = {
  id: 'smith2020',
  title: 'Neural Citation Audits Improve Reference Accuracy',
  authors: ['Ada Smith'],
  year: 2020,
  doi: '10.1000/citekit.1'
};

describe('loadEvidenceStore', () => {
  it('splits long evidence paragraphs into sentence windows with locators', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'citekit-evidence-'));
    const evidencePath = join(dir, 'smith2020.txt');
    await writeFile(
      evidencePath,
      [
        'Title: Neural Citation Audits Improve Reference Accuracy.',
        'Citation audits check claims against source text.',
        'They also verify bibliography metadata.',
        'Unrelated implementation notes belong in a separate sentence.'
      ].join(' '),
      'utf8'
    );

    const spans = await loadEvidenceStore([evidencePath], [reference]);

    expect(spans.length).toBeGreaterThan(1);
    expect(spans[0]).toMatchObject({
      referenceId: 'smith2020',
      source: 'user_file',
      locator: 'paragraph 1, sentence window 1'
    });
    expect(spans[0].text).toContain(
      'Neural Citation Audits Improve Reference Accuracy'
    );
    expect(spans.at(-1)?.text).toContain('Unrelated implementation notes');
  });
});
