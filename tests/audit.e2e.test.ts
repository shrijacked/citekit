import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { runCitationAudit } from '../src/core/audit.js';
import { FixtureMetadataProvider } from '../src/providers/fixture.js';

const fixtureDir = resolve('tests/fixtures');

describe('runCitationAudit', () => {
  it('produces a strict offline audit report with proof objects', async () => {
    const provider = await FixtureMetadataProvider.fromFile(
      resolve(fixtureDir, 'metadata.json')
    );

    const report = await runCitationAudit({
      manuscriptPath: resolve(fixtureDir, 'paper.md'),
      bibliographyPath: resolve(fixtureDir, 'refs.bib'),
      venue: 'ieee',
      style: 'ieee',
      evidencePaths: [resolve(fixtureDir, 'evidence')],
      metadataProviders: [provider]
    });

    expect(report.summary.references).toMatchObject({
      verified: 1,
      metadata_mismatch: 1,
      not_found: 1
    });
    expect(report.summary.claims.supported).toBe(1);
    expect(report.summary.claims.contradicted).toBe(1);
    expect(report.summary.claims.unverifiable).toBe(1);
    expect(report.summary.exitCode).toBe(1);
    expect(report.findings.some((finding) => finding.proof)).toBe(true);
    expect(
      report.findings.find((finding) => finding.claimId === 'C2')?.proof
        ?.evidenceQuotes?.[0]
    ).toMatchObject({
      source: 'user_file',
      text: expect.stringContaining('Large language models do not always cite')
    });
    expect(
      report.findings.find((finding) => finding.referenceId === 'doe2021')?.proof
    ).toMatchObject({
      field: 'title',
      expected: 'Large Language Models Always Cite Accurately',
      actual: 'Large Language Models Often Cite Inaccurately'
    });
  });
});
