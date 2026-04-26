import { readFile } from 'node:fs/promises';
import type { MetadataProvider, ReferenceRecord } from '../types.js';
import { normalizeDoi, normalizeTitle } from '../core/text.js';

export class FixtureMetadataProvider implements MetadataProvider {
  readonly name = 'fixture' as const;

  constructor(private readonly records: ReferenceRecord[]) {}

  static async fromFile(path: string): Promise<FixtureMetadataProvider> {
    const records = JSON.parse(await readFile(path, 'utf8')) as ReferenceRecord[];
    return new FixtureMetadataProvider(records);
  }

  async resolve(reference: ReferenceRecord): Promise<ReferenceRecord[]> {
    const doi = normalizeDoi(reference.doi);
    const title = normalizeTitle(reference.title);

    return this.records.filter((record) => {
      const recordDoi = normalizeDoi(record.doi);
      if (doi && recordDoi && doi === recordDoi) {
        return true;
      }
      return Boolean(title && normalizeTitle(record.title) === title);
    });
  }
}
