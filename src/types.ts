export type ReferenceVerdict =
  | 'verified'
  | 'ambiguous'
  | 'not_found'
  | 'metadata_mismatch';

export type ClaimVerdict =
  | 'supported'
  | 'weak_support'
  | 'contradicted'
  | 'unverifiable';

export type FormattingVerdict = 'pass' | 'warning' | 'fail';

export type VerificationVerdict =
  | ReferenceVerdict
  | ClaimVerdict
  | FormattingVerdict;

export type CitationAuditInput = {
  manuscriptPath: string;
  bibliographyPath: string;
  style?: string;
  venue?: string;
  evidencePaths?: string[];
  metadataProviders?: MetadataProvider[];
  metadataCachePath?: string;
  fetchRemoteEvidence?: boolean;
  remoteEvidenceFetch?: typeof fetch;
  rulePacks?: VenueRulePack[];
  claimClassifier?: ClaimEvidenceClassifier;
};

export type ReferenceRecord = {
  id: string;
  type?: string;
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  doi?: string;
  url?: string;
  raw?: Record<string, unknown>;
};

export type ClaimCitationLink = {
  id: string;
  claim: string;
  citationKeys: string[];
  source: {
    path: string;
    line: number;
  };
};

export type EvidenceSpan = {
  id: string;
  referenceId: string;
  text: string;
  source: 'user_file' | 'metadata' | ResolverSource;
  locator?: string;
  path?: string;
};

export type ResolverSource =
  | 'crossref'
  | 'openalex'
  | 'semantic_scholar'
  | 'fixture'
  | 'local';

export type ResolvedReference = {
  input: ReferenceRecord;
  resolved?: ReferenceRecord;
  verdict: ReferenceVerdict;
  source?: ResolverSource;
  confidence: number;
  mismatches: MetadataMismatch[];
  evidence: EvidenceSpan[];
};

export type MetadataMismatch = {
  field: 'title' | 'authors' | 'year' | 'doi' | 'venue';
  expected?: string | number | string[];
  actual?: string | number | string[];
  message: string;
};

export type MetadataProvider = {
  name: ResolverSource;
  resolve(reference: ReferenceRecord): Promise<ReferenceRecord[]>;
};

export type ClaimVerification = {
  claim: ClaimCitationLink;
  verdict: ClaimVerdict;
  confidence: number;
  supportingSpans: EvidenceSpan[];
  contradictedBy: EvidenceSpan[];
  message: string;
};

export type ClaimEvidenceClassifier = (request: {
  claim: ClaimCitationLink;
  references: ReferenceRecord[];
  evidence: EvidenceSpan[];
}) => Promise<{
  verdict: ClaimVerdict;
  confidence: number;
  supportingSpanIds?: string[];
  contradictedBySpanIds?: string[];
  message: string;
}>;

export type VenueRulePack = {
  id: string;
  label: string;
  cslStyle?: string;
  rules: VenueRules;
};

export type VenueRules = {
  requireDoi?: boolean;
  requireUrlWhenNoDoi?: boolean;
  disallowUrlWhenDoiPresent?: boolean;
  requireYear?: boolean;
  referenceOrder?: 'citation_order' | 'alphabetical';
  maxAuthorsBeforeEtAl?: number;
};

export type FormattingFinding = {
  referenceId?: string;
  rule: keyof VenueRules | 'style';
  verdict: FormattingVerdict;
  message: string;
  suggestedFix?: string;
};

export type RenderedBibliography = {
  style: string;
  entries: string[];
};

export type AuditFinding = {
  id: string;
  severity: 'error' | 'warning' | 'info';
  category: 'reference' | 'claim' | 'formatting';
  verdict: VerificationVerdict;
  message: string;
  referenceId?: string;
  claimId?: string;
  proof?: {
    resolverSource?: ResolverSource;
    evidenceSpanIds?: string[];
    evidenceQuotes?: Array<{
      id: string;
      source: EvidenceSpan['source'];
      locator?: string;
      path?: string;
      text: string;
    }>;
    field?: MetadataMismatch['field'] | keyof VenueRules | 'style';
    expected?: unknown;
    actual?: unknown;
  };
  suggestedFix?: string;
};

export type CitationAuditReport = {
  generatedAt: string;
  summary: {
    references: Record<ReferenceVerdict, number>;
    claims: Record<ClaimVerdict, number>;
    formatting: Record<FormattingVerdict, number>;
    exitCode: number;
  };
  inputs: {
    manuscriptPath: string;
    bibliographyPath: string;
    style: string;
    venue?: string;
  };
  references: ResolvedReference[];
  claims: ClaimVerification[];
  formatting: FormattingFinding[];
  bibliography: RenderedBibliography;
  findings: AuditFinding[];
};
