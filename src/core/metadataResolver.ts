import type {
  MetadataMismatch,
  MetadataProvider,
  ReferenceRecord,
  ResolvedReference
} from '../types.js';
import {
  authorOverlap,
  jaccardSimilarity,
  normalizeDoi,
  normalizeTitle
} from './text.js';

export async function resolveReferences(
  references: ReferenceRecord[],
  providers: MetadataProvider[]
): Promise<ResolvedReference[]> {
  const resolved: ResolvedReference[] = [];

  for (const reference of references) {
    resolved.push(await resolveReference(reference, providers));
  }

  return resolved;
}

export async function resolveReference(
  reference: ReferenceRecord,
  providers: MetadataProvider[]
): Promise<ResolvedReference> {
  const candidates: Array<{
    provider: MetadataProvider;
    record: ReferenceRecord;
    score: number;
  }> = [];

  for (const provider of providers) {
    try {
      const records = await provider.resolve(reference);
      for (const record of records) {
        candidates.push({
          provider,
          record,
          score: scoreCandidate(reference, record)
        });
      }
    } catch {
      // Provider errors should not hide verifiable failures from other providers.
    }
  }

  candidates.sort((left, right) => right.score - left.score);

  if (candidates.length === 0 || candidates[0].score < 0.45) {
    return {
      input: reference,
      verdict: 'not_found',
      confidence: 0,
      mismatches: [],
      evidence: []
    };
  }

  if (
    candidates.length > 1 &&
    candidates[0].score - candidates[1].score < 0.08 &&
    !sameDoi(reference, candidates[0].record)
  ) {
    return {
      input: reference,
      resolved: candidates[0].record,
      verdict: 'ambiguous',
      source: candidates[0].provider.name,
      confidence: round(candidates[0].score),
      mismatches: [],
      evidence: []
    };
  }

  const best = candidates[0];
  const mismatches = compareMetadata(reference, best.record);

  return {
    input: reference,
    resolved: best.record,
    verdict: mismatches.length > 0 ? 'metadata_mismatch' : 'verified',
    source: best.provider.name,
    confidence: round(best.score),
    mismatches,
    evidence: []
  };
}

export function scoreCandidate(
  input: ReferenceRecord,
  candidate: ReferenceRecord
): number {
  if (sameDoi(input, candidate)) {
    return 0.98;
  }

  const titleScore = jaccardSimilarity(input.title, candidate.title);
  const authorScore = authorOverlap(input.authors, candidate.authors);
  const yearScore =
    input.year && candidate.year ? (input.year === candidate.year ? 1 : 0) : 0.4;

  return round(titleScore * 0.65 + authorScore * 0.25 + yearScore * 0.1);
}

export function compareMetadata(
  input: ReferenceRecord,
  resolved: ReferenceRecord
): MetadataMismatch[] {
  const mismatches: MetadataMismatch[] = [];

  const inputDoi = normalizeDoi(input.doi);
  const resolvedDoi = normalizeDoi(resolved.doi);
  if (inputDoi && resolvedDoi && inputDoi !== resolvedDoi) {
    mismatches.push({
      field: 'doi',
      expected: inputDoi,
      actual: resolvedDoi,
      message: `DOI differs: input has ${inputDoi}, resolver returned ${resolvedDoi}.`
    });
  }

  if (normalizeTitle(input.title) && normalizeTitle(resolved.title)) {
    const titleScore = jaccardSimilarity(input.title, resolved.title);
    if (titleScore < 0.72) {
      mismatches.push({
        field: 'title',
        expected: input.title,
        actual: resolved.title,
        message: `Title does not match resolved metadata (${Math.round(
          titleScore * 100
        )}% token overlap).`
      });
    }
  }

  if (input.year && resolved.year && input.year !== resolved.year) {
    mismatches.push({
      field: 'year',
      expected: input.year,
      actual: resolved.year,
      message: `Year differs: input has ${input.year}, resolver returned ${resolved.year}.`
    });
  }

  if (
    input.authors.length > 0 &&
    resolved.authors.length > 0 &&
    authorOverlap(input.authors, resolved.authors) < 0.5
  ) {
    mismatches.push({
      field: 'authors',
      expected: input.authors,
      actual: resolved.authors,
      message: 'Author list does not overlap enough with resolved metadata.'
    });
  }

  return mismatches;
}

function sameDoi(left: ReferenceRecord, right: ReferenceRecord): boolean {
  const leftDoi = normalizeDoi(left.doi);
  const rightDoi = normalizeDoi(right.doi);
  return Boolean(leftDoi && rightDoi && leftDoi === rightDoi);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
