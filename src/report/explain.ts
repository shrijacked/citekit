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
  const references = claim.claim.citationKeys.map((key) =>
    report.references.find((reference) => reference.input.id === key)
  );

  return [
    `${claim.claim.id}: ${claim.verdict} (${claim.confidence})`,
    claim.claim.claim,
    `Source: ${claim.claim.source.path}:${claim.claim.source.line}`,
    '',
    claim.message,
    '',
    'Citations:',
    references
      .map((reference, index) => {
        const key = claim.claim.citationKeys[index];
        if (!reference) {
          return `- ${key}: missing from bibliography`;
        }
        return `- ${key}: ${reference.verdict}${
          reference.source ? ` via ${reference.source}` : ''
        }\n  ${reference.input.title}${
          reference.input.doi ? `\n  DOI: ${reference.input.doi}` : ''
        }`;
      })
      .join('\n') || '- none',
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
          .map((finding) => {
            const quoteText = finding.proof?.evidenceQuotes
              ?.map(
                (quote) =>
                  `\n  ${quote.id} [${quote.source}${
                    quote.locator ? `, ${quote.locator}` : ''
                  }]: ${quote.text}`
              )
              .join('');
            return `- ${finding.severity}: ${finding.message}${
              finding.suggestedFix ? `\n  Fix: ${finding.suggestedFix}` : ''
            }${quoteText ?? ''}`;
          })
          .join('\n')
      : '- no findings'
  ].join('\n');
}
