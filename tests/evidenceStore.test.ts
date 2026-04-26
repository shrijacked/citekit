import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  loadEvidenceStore,
  loadRemoteEvidenceFromResolved
} from '../src/core/evidenceStore.js';
import type { ReferenceRecord, ResolvedReference } from '../src/types.js';

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

  it('loads remote evidence from resolved OpenAlex content URLs', async () => {
    const resolved: ResolvedReference = {
      input: reference,
      resolved: {
        ...reference,
        raw: {
          content_url: 'https://content.openalex.org/works/W1'
        }
      },
      verdict: 'verified',
      source: 'openalex',
      confidence: 1,
      mismatches: [],
      evidence: []
    };
    const fetchImpl = async () =>
      new Response(
        'Neural citation audits improve reference accuracy by checking every cited claim against source text.',
        {
          status: 200,
          headers: {
            'content-type': 'text/plain'
          }
        }
      );

    const spans = await loadRemoteEvidenceFromResolved(
      [resolved],
      fetchImpl as typeof fetch
    );

    expect(spans).toEqual([
      expect.objectContaining({
        id: 'R1',
        referenceId: 'smith2020',
        source: 'openalex',
        path: 'https://content.openalex.org/works/W1',
        text: expect.stringContaining('Neural citation audits improve')
      })
    ]);
  });

  it('loads remote evidence from resolved OpenAlex PDF URLs', async () => {
    const resolved: ResolvedReference = {
      input: reference,
      resolved: {
        ...reference,
        raw: {
          best_oa_location: {
            pdf_url: 'https://openalex.org/pdfs/W1.pdf',
            landing_page_url: 'https://openalex.org/works/W1'
          }
        }
      },
      verdict: 'verified',
      source: 'openalex',
      confidence: 1,
      mismatches: [],
      evidence: []
    };
    const fetchImpl = vi.fn(async () =>
      new Response(
        'Neural citation audits improve reference accuracy using open access PDFs.',
        {
          status: 200,
          headers: {
            'content-type': 'text/plain'
          }
        }
      )
    );

    const spans = await loadRemoteEvidenceFromResolved(
      [resolved],
      fetchImpl as unknown as typeof fetch
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://openalex.org/pdfs/W1.pdf',
      expect.any(Object)
    );
    expect(spans[0]).toMatchObject({
      referenceId: 'smith2020',
      source: 'openalex',
      path: 'https://openalex.org/pdfs/W1.pdf'
    });
  });
});
