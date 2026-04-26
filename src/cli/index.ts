#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { Command } from 'commander';
import {
  checkFormatting,
  FixtureMetadataProvider,
  loadReferences,
  loadVenueRulePack,
  renderBibliography,
  runCitationAudit
} from '../index.js';
import type { CitationAuditReport, MetadataProvider } from '../types.js';
import { explainClaim, renderHtmlReport } from '../report/index.js';

const program = new Command();

program
  .name('citekit')
  .description('Verifiable citation audit engine')
  .version('0.1.0');

program
  .command('check')
  .argument('<manuscript>', 'Markdown or LaTeX manuscript path')
  .requiredOption('--bib <path>', 'BibTeX or CSL JSON bibliography path')
  .option(
    '--style <style>',
    'CSL style id, packaged style name, or local .csl path'
  )
  .option('--venue <venue>', 'Venue rule pack id, e.g. ieee or acm-sigconf')
  .option('--evidence <paths...>', 'Evidence files or directories')
  .option('--report <format>', 'Report format: json or html', 'json')
  .option('--out <path>', 'Write report to a file instead of stdout')
  .option(
    '--metadata-fixture <path>',
    'Use a local metadata fixture JSON file instead of live providers'
  )
  .option(
    '--metadata-cache <path>',
    'Cache metadata resolver responses in a JSON file'
  )
  .option('--offline', 'Disable live metadata providers')
  .action(
    async (
      manuscript: string,
      options: {
        bib: string;
        style?: string;
        venue?: string;
        evidence?: string[];
        report: 'json' | 'html';
        out?: string;
        metadataFixture?: string;
        metadataCache?: string;
        offline?: boolean;
      }
    ) => {
      const metadataProviders = await metadataProvidersFromOptions(options);
      const report = await runCitationAudit({
        manuscriptPath: manuscript,
        bibliographyPath: options.bib,
        style: options.style,
        venue: options.venue,
        evidencePaths: options.evidence ?? [],
        metadataProviders,
        metadataCachePath: options.metadataCache
      });

      const rendered =
        options.report === 'html'
          ? renderHtmlReport(report)
          : `${JSON.stringify(report, null, 2)}\n`;
      await writeOrPrint(rendered, options.out);
      process.exitCode = report.summary.exitCode;
    }
  );

program
  .command('format')
  .argument('<bibliography>', 'BibTeX or CSL JSON bibliography path')
  .option(
    '--style <style>',
    'CSL style id, packaged style name, or local .csl path'
  )
  .option('--venue <venue>', 'Venue rule pack id')
  .option('--out <path>', 'Write formatted bibliography to a file')
  .action(
    async (
      bibliographyPath: string,
      options: {
        style?: string;
        venue?: string;
        out?: string;
      }
    ) => {
      const references = await loadReferences(bibliographyPath);
      const rulePack = await loadVenueRulePack(options.venue);
      const bibliography = await renderBibliography(
        references,
        options.style ?? rulePack?.cslStyle ?? 'ieee'
      );
      const findings = checkFormatting(references, rulePack);
      const output = bibliography.entries.join('\n\n') + '\n';
      await writeOrPrint(output, options.out);

      const failed = findings.some((finding) => finding.verdict === 'fail');
      const warnings = findings.filter((finding) => finding.verdict === 'warning');
      for (const warning of warnings) {
        console.error(`warning: ${warning.message}`);
      }
      process.exitCode = failed ? 1 : 0;
    }
  );

program
  .command('explain')
  .argument('<report>', 'CiteKit JSON report path')
  .requiredOption('--claim <id>', 'Claim id, e.g. C12')
  .action(async (reportPath: string, options: { claim: string }) => {
    const report = JSON.parse(
      await readFile(reportPath, 'utf8')
    ) as CitationAuditReport;
    console.log(explainClaim(report, options.claim));
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function metadataProvidersFromOptions(options: {
  metadataFixture?: string;
  offline?: boolean;
}): Promise<MetadataProvider[] | undefined> {
  if (options.metadataFixture) {
    return [await FixtureMetadataProvider.fromFile(options.metadataFixture)];
  }
  if (options.offline) {
    return [];
  }
  return undefined;
}

async function writeOrPrint(output: string, path?: string): Promise<void> {
  if (path) {
    await writeFile(path, output, 'utf8');
  } else {
    process.stdout.write(output);
  }
}
