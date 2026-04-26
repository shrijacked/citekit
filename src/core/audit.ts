import type {
  AuditFinding,
  CitationAuditInput,
  CitationAuditReport,
  ClaimVerification,
  FormattingFinding,
  MetadataProvider,
  ResolvedReference
} from '../types.js';
import { CrossrefProvider } from '../providers/crossref.js';
import { OpenAlexProvider } from '../providers/openalex.js';
import { SemanticScholarProvider } from '../providers/semanticScholar.js';
import { extractClaimsFromFile } from './extractClaims.js';
import { loadReferences } from './references.js';
import {
  loadEvidenceStore,
  metadataEvidenceFromResolved
} from './evidenceStore.js';
import { resolveReferences } from './metadataResolver.js';
import { verifyClaims } from './claimVerifier.js';
import { checkFormatting, loadVenueRulePack } from './formatting.js';
import { renderBibliography } from './renderBibliography.js';

export async function runCitationAudit(
  input: CitationAuditInput
): Promise<CitationAuditReport> {
  const style = input.style ?? 'ieee';
  const claims = await extractClaimsFromFile(input.manuscriptPath);
  const references = await loadReferences(input.bibliographyPath);
  const providers = input.metadataProviders ?? defaultMetadataProviders();
  const resolved = await resolveReferences(references, providers);
  const userEvidence = await loadEvidenceStore(input.evidencePaths ?? [], references);
  const metadataEvidence = metadataEvidenceFromResolved(resolved);
  const claimResults = verifyClaims(claims, resolved, [
    ...userEvidence,
    ...metadataEvidence
  ]);
  const rulePack = await loadVenueRulePack(input.venue, input.rulePacks);
  const formatting = checkFormatting(references, rulePack, claims);
  const bibliography = await renderBibliography(references, style);
  const findings = [
    ...referenceFindings(resolved),
    ...claimFindings(claimResults),
    ...formattingFindings(formatting)
  ];
  const exitCode = findings.some((finding) => finding.severity === 'error') ? 1 : 0;

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      references: {
        verified: resolved.filter((item) => item.verdict === 'verified').length,
        ambiguous: resolved.filter((item) => item.verdict === 'ambiguous').length,
        not_found: resolved.filter((item) => item.verdict === 'not_found').length,
        metadata_mismatch: resolved.filter(
          (item) => item.verdict === 'metadata_mismatch'
        ).length
      },
      claims: {
        supported: claimResults.filter((item) => item.verdict === 'supported')
          .length,
        weak_support: claimResults.filter(
          (item) => item.verdict === 'weak_support'
        ).length,
        contradicted: claimResults.filter((item) => item.verdict === 'contradicted')
          .length,
        unverifiable: claimResults.filter(
          (item) => item.verdict === 'unverifiable'
        ).length
      },
      formatting: {
        pass: formatting.filter((item) => item.verdict === 'pass').length,
        warning: formatting.filter((item) => item.verdict === 'warning').length,
        fail: formatting.filter((item) => item.verdict === 'fail').length
      },
      exitCode
    },
    inputs: {
      manuscriptPath: input.manuscriptPath,
      bibliographyPath: input.bibliographyPath,
      style,
      venue: input.venue
    },
    references: resolved,
    claims: claimResults,
    formatting,
    bibliography,
    findings
  };
}

export function defaultMetadataProviders(): MetadataProvider[] {
  return [
    new CrossrefProvider({ mailto: process.env.CITEKIT_MAILTO }),
    new OpenAlexProvider({ apiKey: process.env.OPENALEX_API_KEY }),
    new SemanticScholarProvider({ apiKey: process.env.SEMANTIC_SCHOLAR_API_KEY })
  ];
}

function referenceFindings(references: ResolvedReference[]): AuditFinding[] {
  const findings: AuditFinding[] = [];

  for (const reference of references) {
    if (reference.verdict === 'verified') {
      continue;
    }

    if (reference.verdict === 'metadata_mismatch') {
      for (const mismatch of reference.mismatches) {
        findings.push({
          id: `R${findings.length + 1}`,
          severity: 'error',
          category: 'reference',
          verdict: reference.verdict,
          referenceId: reference.input.id,
          message: mismatch.message,
          proof: {
            resolverSource: reference.source,
            expected: mismatch.expected,
            actual: mismatch.actual
          },
          suggestedFix:
            'Update the bibliography entry from verified resolver metadata, or replace the citation.'
        });
      }
      continue;
    }

    findings.push({
      id: `R${findings.length + 1}`,
      severity: reference.verdict === 'not_found' ? 'error' : 'warning',
      category: 'reference',
      verdict: reference.verdict,
      referenceId: reference.input.id,
      message:
        reference.verdict === 'not_found'
          ? 'Reference could not be found in configured metadata providers.'
          : 'Reference lookup returned multiple plausible matches.',
      proof: {
        resolverSource: reference.source
      },
      suggestedFix:
        reference.verdict === 'not_found'
          ? 'Add a DOI or correct the title/authors/year.'
          : 'Add a DOI or disambiguating venue/year metadata.'
    });
  }

  return findings;
}

function claimFindings(claims: ClaimVerification[]): AuditFinding[] {
  return claims
    .filter((claim) => claim.verdict !== 'supported')
    .map((claim, index) => ({
      id: `C${index + 1}`,
      severity:
        claim.verdict === 'weak_support' ? ('warning' as const) : ('error' as const),
      category: 'claim' as const,
      verdict: claim.verdict,
      claimId: claim.claim.id,
      message: claim.message,
      proof: {
        evidenceSpanIds: [
          ...claim.supportingSpans.map((span) => span.id),
          ...claim.contradictedBy.map((span) => span.id)
        ]
      },
      suggestedFix:
        claim.verdict === 'weak_support'
          ? 'Tighten the claim or cite a more direct source.'
          : 'Provide source text, change the claim, or replace the citation.'
    }));
}

function formattingFindings(formatting: FormattingFinding[]): AuditFinding[] {
  return formatting
    .filter((finding) => finding.verdict !== 'pass')
    .map((finding, index) => ({
      id: `F${index + 1}`,
      severity:
        finding.verdict === 'fail' ? ('error' as const) : ('warning' as const),
      category: 'formatting' as const,
      verdict: finding.verdict,
      referenceId: finding.referenceId,
      message: finding.message,
      proof: {
        actual: finding.rule
      },
      suggestedFix: finding.suggestedFix
    }));
}
