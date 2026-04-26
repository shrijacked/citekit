import type { CitationAuditReport } from '../types.js';

export function explainClaim(
  report: CitationAuditReport,
  claimId: string
): string {
  const claim = report.claims.find((item) => item.claim.id === claimId);
  if (!claim) {
    throw new Error(`Claim ${claimId} was not found in the report.`);
  }

  const findings = report.findings.filter(
    (finding) => finding.claimId === claimId
  );
  const spans = [...claim.supportingSpans, ...claim.contradictedBy];

  return [
    `${claim.claim.id}: ${claim.verdict} (${claim.confidence})`,
    claim.claim.claim,
    '',
    claim.message,
    '',
    'Citations:',
    claim.claim.citationKeys.map((key) => `- ${key}`).join('\n') || '- none',
    '',
    'Evidence:',
    spans.length > 0
      ? spans
          .map(
            (span) =>
              `- ${span.id} [${span.source}${span.locator ? `, ${span.locator}` : ''}]\n  ${span.text}`
          )
          .join('\n')
      : '- no evidence spans attached',
    '',
    'Findings:',
    findings.length > 0
      ? findings
          .map((finding) => `- ${finding.severity}: ${finding.message}`)
          .join('\n')
      : '- no findings'
  ].join('\n');
}
