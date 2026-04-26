import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  cacheKey,
  CachedMetadataProvider
} from '../src/core/metadataCache.js';
import type { MetadataProvider, ReferenceRecord } from '../src/types.js';

const reference: ReferenceRecord = {
  id: 'smith2020',
  title: 'Neural Citation Audits Improve Reference Accuracy',
  authors: ['Ada Smith'],
  year: 2020,
  doi: '10.1000/CiteKit.1'
};

describe('CachedMetadataProvider', () => {
  it('caches provider results by normalized DOI', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'citekit-cache-'));
    const cachePath = join(dir, 'metadata.json');
    const resolve = vi.fn(async () => [
      {
        ...reference,
        doi: '10.1000/citekit.1'
      }
    ]);
    const provider: MetadataProvider = {
      name: 'fixture',
      resolve
    };
    const cached = new CachedMetadataProvider(provider, cachePath);

    await expect(cached.resolve(reference)).resolves.toHaveLength(1);
    await expect(cached.resolve(reference)).resolves.toHaveLength(1);

    expect(resolve).toHaveBeenCalledTimes(1);
    const cache = JSON.parse(await readFile(cachePath, 'utf8')) as {
      entries: Record<string, unknown>;
    };
    expect(cache.entries[cacheKey('fixture', reference)]).toBeDefined();
  });
});
