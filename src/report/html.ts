import type { CitationAuditReport } from '../types.js';
import { escapeHtml } from '../core/text.js';

export function renderHtmlReport(report: CitationAuditReport): string {
  const findingRows = report.findings
    .map(
      (finding) => `<tr class="${escapeHtml(finding.severity)}">
        <td>${escapeHtml(finding.severity)}</td>
        <td>${escapeHtml(finding.category)}</td>
        <td>${escapeHtml(finding.verdict)}</td>
        <td>${targetLink(finding.referenceId ?? finding.claimId ?? '')}</td>
        <td>${escapeHtml(finding.message)}</td>
        <td>${escapeHtml(finding.suggestedFix ?? '')}</td>
      </tr>`
    )
    .join('\n');

  const claimSections = report.claims
    .map(
      (claim) => `<details id="${escapeHtml(claim.claim.id)}" class="proof ${escapeHtml(
        claim.verdict
      )}" ${claim.verdict !== 'supported' ? 'open' : ''}>
        <summary>
          <span>${escapeHtml(claim.claim.id)}: ${escapeHtml(claim.verdict)}</span>
          <span>${Math.round(claim.confidence * 100)}%</span>
        </summary>
        <p>${escapeHtml(claim.claim.claim)}</p>
        <p><strong>Cites:</strong> ${claim.claim.citationKeys
          .map((key) => `<code>${escapeHtml(key)}</code>`)
          .join(' ')}</p>
        <p><strong>Message:</strong> ${escapeHtml(claim.message)}</p>
        ${claim.supportingSpans
          .map(
            (span) =>
              `<blockquote><strong>${escapeHtml(span.id)}</strong> <em>${escapeHtml(
                span.source
              )}${span.locator ? `, ${escapeHtml(span.locator)}` : ''}</em><br>${escapeHtml(span.text)}</blockquote>`
          )
          .join('\n')}
        ${claim.contradictedBy
          .map(
            (span) =>
              `<blockquote class="error"><strong>${escapeHtml(
                span.id
              )}</strong> <em>${escapeHtml(span.source)}${
                span.locator ? `, ${escapeHtml(span.locator)}` : ''
              }</em><br>${escapeHtml(span.text)}</blockquote>`
          )
          .join('\n')}
      </details>`
    )
    .join('\n');

  const referenceRows = report.references
    .map(
      (reference) => `<tr id="${escapeHtml(reference.input.id)}" class="${escapeHtml(
        reference.verdict === 'verified' ? 'info' : 'error'
      )}">
        <td><code>${escapeHtml(reference.input.id)}</code></td>
        <td>${escapeHtml(reference.verdict)}</td>
        <td>${escapeHtml(reference.input.title)}</td>
        <td>${escapeHtml(reference.input.doi ?? '')}</td>
        <td>${escapeHtml(reference.source ?? '')}</td>
        <td>${reference.mismatches
          .map((mismatch) => escapeHtml(mismatch.message))
          .join('<br>')}</td>
      </tr>`
    )
    .join('\n');

  const bibliography = report.bibliography.entries
    .map((entry) => `<li>${escapeHtml(entry)}</li>`)
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CiteKit Audit Report</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 2rem; color: #172026; line-height: 1.45; }
    main { max-width: 1100px; margin: 0 auto; }
    h1, h2, h3 { line-height: 1.15; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin: 1.5rem 0; }
    .metric { border: 1px solid #d5dde3; border-radius: 8px; padding: 1rem; }
    .metric strong { display: block; font-size: 1.8rem; margin-top: 0.35rem; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0 2rem; }
    th, td { border: 1px solid #d5dde3; padding: 0.6rem; vertical-align: top; text-align: left; }
    th { background: #f4f7f9; }
    tr.error td { border-left: 4px solid #b42318; }
    tr.warning td { border-left: 4px solid #b7791f; }
    tr.info td { border-left: 4px solid #2f6f4e; }
    .proof { border: 1px solid #d5dde3; border-radius: 8px; margin: 0.75rem 0; padding: 0.75rem 1rem; }
    .proof summary { cursor: pointer; display: flex; justify-content: space-between; gap: 1rem; font-weight: 700; }
    .proof.supported { border-left: 4px solid #2f6f4e; }
    .proof.weak_support { border-left: 4px solid #b7791f; }
    .proof.contradicted, .proof.unverifiable { border-left: 4px solid #b42318; }
    blockquote { border-left: 4px solid #476a8a; margin: 0.75rem 0; padding: 0.5rem 1rem; background: #f7fafc; }
    blockquote.error { border-left-color: #b42318; background: #fff5f5; }
    code { background: #eef3f7; padding: 0.1rem 0.3rem; border-radius: 4px; }
    a { color: #174f78; }
  </style>
</head>
<body>
<main>
  <h1>CiteKit Audit Report</h1>
  <p>Generated ${escapeHtml(report.generatedAt)} for <code>${escapeHtml(
    report.inputs.manuscriptPath
  )}</code>.</p>
  <div class="summary">
    <div class="metric">Reference errors<strong>${
      report.summary.references.not_found +
      report.summary.references.metadata_mismatch
    }</strong></div>
    <div class="metric">Claim errors<strong>${
      report.summary.claims.contradicted + report.summary.claims.unverifiable
    }</strong></div>
    <div class="metric">Formatting failures<strong>${
      report.summary.formatting.fail
    }</strong></div>
    <div class="metric">Exit code<strong>${report.summary.exitCode}</strong></div>
  </div>

  <h2>Findings</h2>
  <table>
    <thead>
      <tr>
        <th>Severity</th>
        <th>Category</th>
        <th>Verdict</th>
        <th>Target</th>
        <th>Message</th>
        <th>Suggested fix</th>
      </tr>
    </thead>
    <tbody>${findingRows || '<tr><td colspan="6">No findings.</td></tr>'}</tbody>
  </table>

  <h2>References</h2>
  <table>
    <thead>
      <tr>
        <th>Key</th>
        <th>Verdict</th>
        <th>Title</th>
        <th>DOI</th>
        <th>Source</th>
        <th>Mismatches</th>
      </tr>
    </thead>
    <tbody>${referenceRows || '<tr><td colspan="6">No references.</td></tr>'}</tbody>
  </table>

  <h2>Claim Proofs</h2>
  ${claimSections || '<p>No cited claims found.</p>'}

  <h2>Rendered Bibliography</h2>
  <ol>${bibliography}</ol>
</main>
</body>
</html>`;
}

function targetLink(target: string): string {
  if (!target) {
    return '';
  }

  return `<a href="#${escapeHtml(target)}">${escapeHtml(target)}</a>`;
}
