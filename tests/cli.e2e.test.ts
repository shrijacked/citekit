import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
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

  it('guards classifier commands that cite invented evidence spans', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'citekit-classifier-cli-'));
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
          '--evidence',
          resolve(fixtureDir, 'evidence'),
          '--metadata-fixture',
          resolve(fixtureDir, 'metadata.json'),
          '--classifier-command',
          `node "${resolve(fixtureDir, 'classifier-invented.mjs')}"`,
          '--out',
          out
        ],
        { cwd: resolve('.') }
      )
    ).rejects.toMatchObject({ code: 1 });

    const report = JSON.parse(await readFile(out, 'utf8')) as {
      claims: Array<{
        claim: { id: string };
        verdict: string;
        message: string;
      }>;
    };
    const firstClaim = report.claims.find((item) => item.claim.id === 'C1');
    expect(firstClaim?.verdict).toBe('unverifiable');
    expect(firstClaim?.message).toContain(
      'without a valid retrieved evidence span'
    );
  });

  it('formats numeric venue bibliographies in first-citation order', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'citekit-format-order-'));
    const bibliography = join(dir, 'refs.bib');
    const manuscript = join(dir, 'paper.md');
    const out = join(dir, 'references.md');

    await writeFile(
      bibliography,
      `@article{doe2021,
  title = {Large Language Models Always Cite Accurately},
  author = {Doe, Jane},
  journal = {AI Reference Studies},
  year = {2021},
  doi = {10.1000/citekit.2}
}

@article{smith2020,
  title = {Neural Citation Audits Improve Reference Accuracy},
  author = {Smith, Ada},
  journal = {Journal of Verifiable Research},
  year = {2020},
  doi = {10.1000/citekit.1}
}
`,
      'utf8'
    );
    await writeFile(
      manuscript,
      'Neural citation audits improve reference accuracy [@smith2020].\n\nLarge language models always cite accurately [@doe2021].\n',
      'utf8'
    );

    await execFileAsync(
      'pnpm',
      [
        'exec',
        'tsx',
        'src/cli/index.ts',
        'format',
        bibliography,
        '--style',
        'ieee',
        '--venue',
        'ieee',
        '--manuscript',
        manuscript,
        '--out',
        out
      ],
      { cwd: resolve('.') }
    );

    const rendered = await readFile(out, 'utf8');
    expect(rendered.indexOf('Neural Citation Audits')).toBeLessThan(
      rendered.indexOf('Large Language Models')
    );
  });

  it('prints format failures to stderr before exiting non-zero', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'citekit-format-failure-'));
    const bibliography = join(dir, 'refs.bib');
    const out = join(dir, 'references.md');

    await writeFile(
      bibliography,
      `@article{missing2024,
  title = {Missing Required Metadata},
  author = {Smith, Ada},
  journal = {Journal of Verifiable Research}
}
`,
      'utf8'
    );

    await expect(
      execFileAsync(
        'pnpm',
        [
          'exec',
          'tsx',
          'src/cli/index.ts',
          'format',
          bibliography,
          '--style',
          'ieee',
          '--venue',
          'ieee',
          '--out',
          out
        ],
        { cwd: resolve('.') }
      )
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('IEEE requires a DOI')
    });
  });
});
