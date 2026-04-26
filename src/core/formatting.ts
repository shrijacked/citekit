import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import type {
  ClaimCitationLink,
  FormattingFinding,
  ReferenceRecord,
  VenueRulePack
} from '../types.js';
import { authorLastName } from './text.js';

export async function loadVenueRulePack(
  venue?: string,
  provided: VenueRulePack[] = []
): Promise<VenueRulePack | undefined> {
  if (!venue) {
    return undefined;
  }

  const direct = provided.find((rulePack) => rulePack.id === venue);
  if (direct) {
    return direct;
  }

  const cwdPath = join(process.cwd(), 'venues', `${venue}.yaml`);
  const packagePath = new URL(`../../venues/${venue}.yaml`, import.meta.url);
  const path = existsSync(cwdPath) ? cwdPath : packagePath;

  try {
    const raw = await readFile(path, 'utf8');
    return parse(raw) as VenueRulePack;
  } catch {
    return undefined;
  }
}

export function checkFormatting(
  references: ReferenceRecord[],
  rulePack: VenueRulePack | undefined,
  claims: ClaimCitationLink[] = []
): FormattingFinding[] {
  if (!rulePack) {
    return [
      {
        rule: 'style',
        verdict: 'warning',
        message:
          'No venue rule pack was found. CSL rendering can still run, but venue-specific checks were skipped.'
      }
    ];
  }

  const findings: FormattingFinding[] = [];
  const rules = rulePack.rules;

  for (const reference of references) {
    if (rules.requireDoi && !reference.doi) {
      findings.push({
        referenceId: reference.id,
        rule: 'requireDoi',
        verdict: 'fail',
        message: `${rulePack.label} requires a DOI when one exists; this reference has no DOI.`,
        suggestedFix: 'Add the DOI or verify that the work truly has none.'
      });
    }

    if (rules.requireUrlWhenNoDoi && !reference.doi && !reference.url) {
      findings.push({
        referenceId: reference.id,
        rule: 'requireUrlWhenNoDoi',
        verdict: 'fail',
        message: `${rulePack.label} requires a URL when no DOI is present.`,
        suggestedFix: 'Add a stable publisher, repository, or archival URL.'
      });
    }

    if (rules.disallowUrlWhenDoiPresent && reference.doi && reference.url) {
      findings.push({
        referenceId: reference.id,
        rule: 'disallowUrlWhenDoiPresent',
        verdict: 'warning',
        message: `${rulePack.label} discourages URLs when a DOI is already present.`,
        suggestedFix: 'Remove the URL unless the venue explicitly requires both.'
      });
    }

    if (rules.requireYear && !reference.year) {
      findings.push({
        referenceId: reference.id,
        rule: 'requireYear',
        verdict: 'fail',
        message: `${rulePack.label} requires a publication year.`,
        suggestedFix: 'Add the publication year from verified metadata.'
      });
    }

    if (
      rules.maxAuthorsBeforeEtAl &&
      reference.authors.length > rules.maxAuthorsBeforeEtAl
    ) {
      findings.push({
        referenceId: reference.id,
        rule: 'maxAuthorsBeforeEtAl',
        verdict: 'warning',
        message: `${rulePack.label} commonly abbreviates long author lists; this reference has ${reference.authors.length} authors.`,
        suggestedFix: 'Confirm the rendered CSL output uses et al. as required.'
      });
    }
  }

  if (rules.referenceOrder === 'citation_order') {
    findings.push(...checkCitationOrder(references, rulePack, claims));
  } else if (rules.referenceOrder === 'alphabetical') {
    findings.push(...checkAlphabeticalOrder(references, rulePack));
  }

  return findings.length > 0
    ? findings
    : [
        {
          rule: 'style',
          verdict: 'pass',
          message: `${rulePack.label} venue rule checks passed.`
        }
      ];
}

function checkCitationOrder(
  references: ReferenceRecord[],
  rulePack: VenueRulePack,
  claims: ClaimCitationLink[]
): FormattingFinding[] {
  if (claims.length === 0) {
    return [];
  }

  const firstSeen = new Map<string, number>();
  for (const claim of claims) {
    for (const key of claim.citationKeys) {
      if (!firstSeen.has(key)) {
        firstSeen.set(key, firstSeen.size);
      }
    }
  }

  const expected = [...references].sort(
    (left, right) =>
      (firstSeen.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (firstSeen.get(right.id) ?? Number.MAX_SAFE_INTEGER)
  );

  const actualIds = references.map((reference) => reference.id).join('|');
  const expectedIds = expected.map((reference) => reference.id).join('|');

  if (actualIds === expectedIds) {
    return [];
  }

  return [
    {
      rule: 'referenceOrder',
      verdict: 'fail',
      message: `${rulePack.label} requires references in first-citation order.`,
      suggestedFix: `Reorder bibliography as: ${expected
        .map((reference) => reference.id)
        .join(', ')}.`
    }
  ];
}

function checkAlphabeticalOrder(
  references: ReferenceRecord[],
  rulePack: VenueRulePack
): FormattingFinding[] {
  const expected = [...references].sort((left, right) =>
    authorLastName(left.authors[0] ?? '').localeCompare(
      authorLastName(right.authors[0] ?? '')
    )
  );
  const actualIds = references.map((reference) => reference.id).join('|');
  const expectedIds = expected.map((reference) => reference.id).join('|');

  if (actualIds === expectedIds) {
    return [];
  }

  return [
    {
      rule: 'referenceOrder',
      verdict: 'fail',
      message: `${rulePack.label} requires references in alphabetical order.`,
      suggestedFix: `Reorder bibliography as: ${expected
        .map((reference) => reference.id)
        .join(', ')}.`
    }
  ];
}
