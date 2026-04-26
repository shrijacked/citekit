import type {
  ClaimEvidenceClassifier,
  ClaimCitationLink,
  ClaimVerification,
  EvidenceSpan,
  ReferenceRecord,
  ResolvedReference
} from '../types.js';
import { jaccardSimilarity, normalizeTitle, tokenize } from './text.js';

const NEGATION_TERMS = /\b(no|not|never|failed to|fails to|did not|does not|without|neither|nor)\b/i;

export function verifyClaims(
  claims: ClaimCitationLink[],
  references: ResolvedReference[],
  evidence: EvidenceSpan[]
): ClaimVerification[] {
  const knownReferences = new Map(
    references.map((reference) => [reference.input.id, reference.input])
  );

  return claims.map((claim) =>
    verifyClaim(
      claim,
      claim.citationKeys
        .map((key) => knownReferences.get(key))
        .filter((reference): reference is ReferenceRecord => Boolean(reference)),
      evidence
    )
  );
}

export async function verifyClaimsWithClassifier(
  claims: ClaimCitationLink[],
  references: ResolvedReference[],
  evidence: EvidenceSpan[],
  classifier?: ClaimEvidenceClassifier
): Promise<ClaimVerification[]> {
  if (!classifier) {
    return verifyClaims(claims, references, evidence);
  }

  const knownReferences = new Map(
    references.map((reference) => [reference.input.id, reference.input])
  );
  const results: ClaimVerification[] = [];

  for (const claim of claims) {
    const citedReferences = claim.citationKeys
      .map((key) => knownReferences.get(key))
      .filter((reference): reference is ReferenceRecord => Boolean(reference));
    const spans = evidence.filter((span) =>
      claim.citationKeys.includes(span.referenceId)
    );

    if (citedReferences.length !== claim.citationKeys.length || spans.length === 0) {
      results.push(verifyClaim(claim, citedReferences, spans));
      continue;
    }

    const classification = await classifier({
      claim,
      references: citedReferences,
      evidence: spans
    });
    const spanById = new Map(spans.map((span) => [span.id, span]));
    const supportingSpans = (classification.supportingSpanIds ?? [])
      .map((id) => spanById.get(id))
      .filter((span): span is EvidenceSpan => Boolean(span));
    const contradictedBy = (classification.contradictedBySpanIds ?? [])
      .map((id) => spanById.get(id))
      .filter((span): span is EvidenceSpan => Boolean(span));

    if (
      (classification.verdict === 'supported' ||
        classification.verdict === 'weak_support') &&
      supportingSpans.length === 0
    ) {
      results.push({
        claim,
        verdict: 'unverifiable',
        confidence: 0,
        supportingSpans: [],
        contradictedBy: [],
        message:
          `Classifier returned ${classification.verdict} without a valid retrieved evidence span.`
      });
      continue;
    }

    if (classification.verdict === 'contradicted' && contradictedBy.length === 0) {
      results.push({
        claim,
        verdict: 'unverifiable',
        confidence: 0,
        supportingSpans: [],
        contradictedBy: [],
        message:
          'Classifier returned contradicted without a valid retrieved evidence span.'
      });
      continue;
    }

    results.push({
      claim,
      verdict: classification.verdict,
      confidence: clampConfidence(classification.confidence),
      supportingSpans,
      contradictedBy,
      message: classification.message
    });
  }

  return results;
}

export function verifyClaim(
  claim: ClaimCitationLink,
  references: ReferenceRecord[],
  evidence: EvidenceSpan[]
): ClaimVerification {
  const spans = evidence.filter((span) =>
    claim.citationKeys.includes(span.referenceId)
  );

  if (references.length !== claim.citationKeys.length) {
    return {
      claim,
      verdict: 'unverifiable',
      confidence: 0,
      supportingSpans: [],
      contradictedBy: [],
      message: 'Claim cites a key that is missing from the bibliography.'
    };
  }

  if (spans.length === 0) {
    return {
      claim,
      verdict: 'unverifiable',
      confidence: 0,
      supportingSpans: [],
      contradictedBy: [],
      message:
        'No source text was available for the cited reference, so strict verification cannot mark it supported.'
    };
  }

  const ranked = spans
    .map((span) => ({
      span,
      score: supportScore(claim.claim, span.text),
      contradiction: contradicts(claim.claim, span.text)
    }))
    .sort((left, right) => right.score - left.score);

  const contradictedBy = ranked
    .filter((item) => item.contradiction && item.score >= 0.2)
    .slice(0, 3)
    .map((item) => item.span);

  if (contradictedBy.length > 0) {
    return {
      claim,
      verdict: 'contradicted',
      confidence: round(ranked[0]?.score ?? 0),
      supportingSpans: [],
      contradictedBy,
      message: 'Available evidence appears to contradict the cited claim.'
    };
  }

  const best = ranked[0];
  if (best && best.score >= 0.56) {
    return {
      claim,
      verdict: 'supported',
      confidence: round(best.score),
      supportingSpans: [best.span],
      contradictedBy: [],
      message: 'A cited evidence span directly supports the claim.'
    };
  }

  if (best && best.score >= 0.32) {
    return {
      claim,
      verdict: 'weak_support',
      confidence: round(best.score),
      supportingSpans: [best.span],
      contradictedBy: [],
      message:
        'Evidence overlaps with the claim, but the support is too indirect for a strict supported verdict.'
    };
  }

  return {
    claim,
    verdict: 'unverifiable',
    confidence: round(best?.score ?? 0),
    supportingSpans: best ? [best.span] : [],
    contradictedBy: [],
    message: 'Available evidence does not support the claim closely enough.'
  };
}

export function supportScore(claim: string, evidence: string): number {
  const claimTokens = tokenize(stripCitationNoise(claim));
  if (claimTokens.length === 0) {
    return 0;
  }

  const normalizedClaim = normalizeTitle(stripCitationNoise(claim));
  const evidenceText = normalizeTitle(evidence);
  if (normalizedClaim && evidenceText.includes(normalizedClaim)) {
    return 1;
  }

  const evidenceTokens = new Set(tokenize(evidence));
  const directHits = claimTokens.filter((token) => evidenceTokens.has(token)).length;
  const unigramCoverage = directHits / claimTokens.length;
  const phraseCoverage = ngramCoverage(claimTokens, tokenize(evidence), 2);
  const jaccard = jaccardSimilarity(claim, evidence);
  const weightedCoverage = unigramCoverage * 0.45 + phraseCoverage * 0.45;

  return round(Math.max(weightedCoverage, jaccard));
}

function contradicts(claim: string, evidence: string): boolean {
  const claimNegated = NEGATION_TERMS.test(claim);
  const evidenceNegated = NEGATION_TERMS.test(evidence);
  if (claimNegated === evidenceNegated) {
    return false;
  }

  return supportScore(claim, evidence) >= 0.22;
}

function stripCitationNoise(value: string): string {
  return value.replace(/\[[^\]]+\]/g, '').replace(/\\cite\w*\{[^}]+\}/g, '');
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clampConfidence(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return round(Math.min(1, Math.max(0, value)));
}

function ngramCoverage(
  claimTokens: string[],
  evidenceTokens: string[],
  size: number
): number {
  const claimNgrams = ngrams(claimTokens, size);
  if (claimNgrams.length === 0) {
    return 0;
  }
  const evidenceNgrams = new Set(ngrams(evidenceTokens, size));
  const hits = claimNgrams.filter((ngram) => evidenceNgrams.has(ngram)).length;
  return hits / claimNgrams.length;
}

function ngrams(tokens: string[], size: number): string[] {
  if (tokens.length < size) {
    return [];
  }
  const results: string[] = [];
  for (let index = 0; index <= tokens.length - size; index += 1) {
    results.push(tokens.slice(index, index + size).join(' '));
  }
  return results;
}
