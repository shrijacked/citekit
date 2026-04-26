import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const fixtureDir = resolve('tests/fixtures');

describe('citekit CLI', () => {
  it('writes an offline JSON report and exits non-zero when the audit fails', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'citekit-'));
    const out = join(dir, 'report.json');

    await expect(
      execFileAsync(
        'pnpm',
        [
          'exec',
          'tsx',
          'src/cli/index.ts',
          'check',
          resolve(fixtureDir, 'paper.md'),
          '--bib',
          resolve(fixtureDir, 'refs.bib'),
          '--venue',
          'ieee',
          '--style',
          'ieee',
          '--evidence',
          resolve(fixtureDir, 'evidence'),
          '--metadata-fixture',
          resolve(fixtureDir, 'metadata.json'),
          '--report',
          'json',
          '--out',
          out
        ],
        { cwd: resolve('.') }
      )
    ).rejects.toMatchObject({ code: 1 });

    const report = JSON.parse(await readFile(out, 'utf8')) as {
      summary: { exitCode: number };
    };
    expect(report.summary.exitCode).toBe(1);
  });

  it('accepts RIS bibliographies through the check command', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'citekit-ris-cli-'));
    const out = join(dir, 'report.json');

    await expect(
      execFileAsync(
        'pnpm',
        [
          'exec',
          'tsx',
          'src/cli/index.ts',
          'check',
          resolve(fixtureDir, 'paper.md'),
          '--bib',
          resolve(fixtureDir, 'refs.ris'),
          '--venue',
          'ieee',
          '--evidence',
          resolve(fixtureDir, 'evidence'),
          '--metadata-fixture',
          resolve(fixtureDir, 'metadata.json'),
          '--metadata-cache',
          join(dir, 'metadata-cache.json'),
          '--out',
          out
        ],
        { cwd: resolve('.') }
      )
    ).rejects.toMatchObject({ code: 1 });

    const report = JSON.parse(await readFile(out, 'utf8')) as {
      inputs: { bibliographyPath: string };
      findings: Array<{ proof?: { evidenceQuotes?: unknown[] } }>;
    };
    expect(report.inputs.bibliographyPath).toContain('refs.ris');
    expect(
      report.findings.some((finding) => finding.proof?.evidenceQuotes?.length)
    ).toBe(true);
  });
});
