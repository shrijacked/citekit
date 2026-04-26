# CiteKit

CiteKit is a verifiable citation audit engine for research writing. It checks three
different things separately:

1. Whether each reference is real and its metadata matches resolver data.
2. Whether a cited source actually supports the claim that cites it.
3. Whether the bibliography follows a target venue's formatting rules.

That separation is the point. Formatting should never mutate truth, and claim
verification should never be hidden inside citation rendering.

## Install

```bash
pnpm install
pnpm build
```

During development, run commands through `tsx`:

```bash
pnpm dev -- check tests/fixtures/paper.md \
  --bib tests/fixtures/refs.bib \
  --style ieee \
  --venue ieee \
  --evidence tests/fixtures/evidence \
  --fetch-remote-evidence \
  --metadata-cache .citekit-cache/metadata.json \
  --metadata-fixture tests/fixtures/metadata.json
```

After building, use the compiled CLI:

```bash
node dist/cli/index.js check paper.tex \
  --bib refs.bib \
  --style ieee \
  --venue acm-sigconf \
  --evidence ./pdfs \
  --report html \
  --out citekit-report.html
```

## CLI

### `citekit check`

Runs the full audit.

```bash
citekit check paper.tex \
  --bib refs.bib \
  --style ieee \
  --venue acm-sigconf \
  --evidence ./evidence \
  --classifier-command 'node ./classify-claim.mjs' \
  --report json \
  --out report.json
```

Useful options:

- `--bib <path>`: required. Supports BibTeX (`.bib`) and CSL JSON (`.json`).
- RIS (`.ris`) bibliographies are supported too.
- `--style <style>`: CSL template name. Defaults to `ieee`.
- `--venue <venue>`: venue rule pack id from `venues/*.yaml`.
- `--evidence <paths...>`: files or directories containing `.txt`, `.md`, `.tex`,
  `.xml`, `.tei`, or `.pdf` evidence.
- `--fetch-remote-evidence`: opt-in fetch for remote content URLs exposed by
  resolver metadata, such as OpenAlex `content_url` or open-access URLs.
- `--metadata-fixture <path>`: deterministic resolver fixture for tests and offline CI.
- `--metadata-cache <path>`: JSON cache for resolver responses, useful for live
  Crossref/OpenAlex/Semantic Scholar runs.
- `--classifier-command <command>`: optional external classifier. The command reads
  one claim verification request as JSON from stdin and writes one JSON verdict to
  stdout.
- `--offline`: disables live metadata providers.
- `--report json|html`: output format.
- `--out <path>`: writes the report to a file.

The command exits with code `1` when it finds reference errors, contradicted or
unverifiable claims, or formatting failures.

### `citekit format`

Renders a bibliography and applies venue rule checks.

```bash
citekit format refs.bib --style nature --venue nature --out references.md
```

### `citekit explain`

Explains one claim from a JSON report.

```bash
citekit explain report.json --claim C12
```

The explanation includes the manuscript source line, cited reference status, DOI,
evidence quotes, locators, findings, and suggested fixes.

## External Classifiers

`--classifier-command` lets teams plug in their own local model, hosted model
wrapper, or deterministic classifier without binding CiteKit to one AI vendor.
CiteKit runs the command without a shell, sends only retrieved spans, and validates
that any `supported`, `weak_support`, or `contradicted` verdict cites span ids from
that request.

Input on stdin:

```json
{
  "claim": { "id": "C1", "claim": "...", "citationKeys": ["smith2020"] },
  "references": [{ "id": "smith2020", "title": "...", "authors": ["..."] }],
  "evidence": [{ "id": "E1", "referenceId": "smith2020", "text": "..." }]
}
```

Output on stdout:

```json
{
  "verdict": "supported",
  "confidence": 0.91,
  "supportingSpanIds": ["E1"],
  "message": "The cited span directly supports the claim."
}
```

Run only classifier commands you trust. They execute as local processes. Their
output cannot create support without retrieved span ids, but the process itself has
the permissions of your shell.

## Library API

```ts
import {
  FixtureMetadataProvider,
  runCitationAudit
} from 'citekit';

const provider = await FixtureMetadataProvider.fromFile('metadata.json');

const report = await runCitationAudit({
  manuscriptPath: 'paper.md',
  bibliographyPath: 'refs.bib',
  style: 'ieee',
  venue: 'ieee',
  evidencePaths: ['./evidence'],
  fetchRemoteEvidence: true,
  metadataCachePath: '.citekit-cache/metadata.json',
  metadataProviders: [provider]
});
```

Public types include:

- `CitationAuditInput`
- `ReferenceRecord`
- `ClaimCitationLink`
- `EvidenceSpan`
- `VerificationVerdict`
- `VenueRulePack`
- `AuditFinding`

## Trust Model

CiteKit is strict by default.

- A real paper with wrong title, authors, DOI, or year becomes `metadata_mismatch`.
- A missing paper becomes `not_found`.
- A claim with no available source text becomes `unverifiable`.
- A claim only becomes `supported` when retrieved source text directly supports it.
- Remote evidence fetching is off by default. When enabled, CiteKit only uses URLs
  exposed by resolver metadata and still requires quoted retrieved spans in proof.
- Optional AI classifiers can only classify retrieved evidence spans. If a classifier
  returns an evidence-based verdict without retrieved span ids, CiteKit downgrades
  the claim to `unverifiable`.
- The CLI classifier hook is vendor-neutral by design. It passes JSON over stdin and
  requires exact span ids in JSON over stdout.

No source text means no support verdict. That is intentional.

## Architecture

```mermaid
flowchart LR
  A["Markdown/LaTeX manuscript"] --> B["Claim + citation extractor"]
  C["BibTeX / CSL JSON / RIS"] --> D["Reference normalizer"]
  D --> E["Metadata resolver"]
  F["User PDFs / TEI / text evidence"] --> G["Evidence store"]
  B --> H["Claim-support verifier"]
  E --> H
  G --> H
  N["Optional external classifier"] --> H
  D --> I["CSL renderer"]
  J["Venue rule pack"] --> K["Formatting checker"]
  I --> K
  H --> L["Audit report"]
  K --> L
```

## Venue Rule Packs

Rule packs live in `venues/*.yaml`. They intentionally cover checks that CSL alone
does not express cleanly:

```yaml
id: ieee
label: IEEE
cslStyle: ieee
rules:
  requireDoi: true
  requireUrlWhenNoDoi: true
  disallowUrlWhenDoiPresent: true
  requireYear: true
  referenceOrder: citation_order
  maxAuthorsBeforeEtAl: 6
```

CSL handles rendering. Rule packs handle venue policy.

Packaged rule packs:

- `ieee`
- `acm-sigconf`
- `nature`
- `apa`
- `vancouver`
- `neurips`
- `acl`

## Metadata Providers

CiteKit includes provider adapters for:

- Crossref
- OpenAlex
- Semantic Scholar
- Local JSON fixtures for tests and offline CI

Live provider errors do not crash the audit. They produce no candidates, allowing
other providers to resolve the reference.

## Tests

```bash
pnpm typecheck
pnpm test
pnpm build
```

The test suite covers:

- BibTeX normalization
- RIS normalization
- Markdown and LaTeX claim extraction
- fake DOI detection
- metadata mismatch detection
- supported, contradicted, and unverifiable claims
- resolver caching
- opt-in remote evidence loading from resolver content URLs
- venue rule failures
- offline CLI end-to-end reporting
- proof-rich claim explanations
