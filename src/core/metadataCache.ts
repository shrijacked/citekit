import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { MetadataProvider, ReferenceRecord, ResolverSource } from '../types.js';
import { normalizeDoi, normalizeTitle } from './text.js';

type CacheFile = {
  version: 1;
  entries: Record<
    string,
    {
      provider: ResolverSource;
      cachedAt: string;
      records: ReferenceRecord[];
    }
  >;
};

export class CachedMetadataProvider implements MetadataProvider {
  readonly name: ResolverSource;
  private cache?: CacheFile;

  constructor(
    private readonly provider: MetadataProvider,
    private readonly cachePath: string
  ) {
    this.name = provider.name;
  }

  async resolve(reference: ReferenceRecord): Promise<ReferenceRecord[]> {
    const cache = await this.loadCache();
    const key = cacheKey(this.provider.name, reference);
    const hit = cache.entries[key];
    if (hit) {
      return hit.records;
    }

    const records = await this.provider.resolve(reference);
    cache.entries[key] = {
      provider: this.provider.name,
      cachedAt: new Date().toISOString(),
      records
    };
    await this.saveCache(cache);
    return records;
  }

  private async loadCache(): Promise<CacheFile> {
    if (this.cache) {
      return this.cache;
    }

    try {
      this.cache = JSON.parse(await readFile(this.cachePath, 'utf8')) as CacheFile;
    } catch {
      this.cache = {
        version: 1,
        entries: {}
      };
    }

    return this.cache;
  }

  private async saveCache(cache: CacheFile): Promise<void> {
    await mkdir(dirname(this.cachePath), { recursive: true });
    await writeFile(this.cachePath, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
  }
}

export function withMetadataCache(
  providers: MetadataProvider[],
  cachePath?: string
): MetadataProvider[] {
  if (!cachePath) {
    return providers;
  }

  return providers.map((provider) => new CachedMetadataProvider(provider, cachePath));
}

export function cacheKey(
  provider: ResolverSource,
  reference: ReferenceRecord
): string {
  const doi = normalizeDoi(reference.doi);
  if (doi) {
    return `${provider}:doi:${doi}`;
  }

  return `${provider}:title:${normalizeTitle(reference.title)}:year:${
    reference.year ?? 'unknown'
  }`;
}
