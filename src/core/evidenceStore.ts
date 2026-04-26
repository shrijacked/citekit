import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import type { EvidenceSpan, ReferenceRecord, ResolvedReference } from '../types.js';
import { normalizeTitle, slugify } from './text.js';

export async function loadEvidenceStore(
  evidencePaths: string[],
  references: ReferenceRecord[]
): Promise<EvidenceSpan[]> {
  const files = await collectFiles(evidencePaths);
  const spans: EvidenceSpan[] = [];

  for (const file of files) {
    const text = await readEvidenceText(file);
    if (!text.trim()) {
      continue;
    }

    const referenceId = matchEvidenceFile(file, text, references);
    if (!referenceId) {
      continue;
    }

    spans.push(
      ...evidenceSpansFromText({
        text,
        referenceId,
        source: 'user_file',
        offset: spans.length,
        path: file,
        idPrefix: 'E'
      })
    );
  }

  return spans;
}

export async function loadRemoteEvidenceFromResolved(
  references: ResolvedReference[],
  fetchImpl: typeof fetch = fetch
): Promise<EvidenceSpan[]> {
  const spans: EvidenceSpan[] = [];

  for (const reference of references) {
    const url = firstRemoteEvidenceUrl(reference);
    if (!url) {
      continue;
    }

    try {
      const response = await fetchImpl(url, {
        headers: {
          Accept: 'text/plain, text/xml, application/xml, text/html;q=0.8, */*;q=0.1'
        }
      });
      if (!response.ok) {
        continue;
      }
      const contentType = response.headers.get('content-type') ?? '';
      const text = await remoteResponseText(response, contentType);
      if (!text.trim()) {
        continue;
      }
      spans.push(
        ...evidenceSpansFromText({
          text,
          referenceId: reference.input.id,
          source: reference.source ?? 'metadata',
          offset: spans.length,
          path: url,
          idPrefix: 'R'
        })
      );
    } catch {
      // Remote evidence fetches are best-effort. Metadata and local evidence still count.
    }
  }

  return spans;
}

export function metadataEvidenceFromResolved(
  references: ResolvedReference[]
): EvidenceSpan[] {
  const spans: EvidenceSpan[] = [];

  for (const resolved of references) {
    const record = resolved.resolved ?? resolved.input;
    const raw = record.raw ?? {};
    const abstract =
      typeof raw.abstract === 'string'
        ? raw.abstract
        : typeof raw.Abstract === 'string'
          ? raw.Abstract
          : undefined;

    if (!abstract) {
      continue;
    }

    spans.push({
      id: `M${spans.length + 1}`,
      referenceId: resolved.input.id,
      text: abstract,
      source: resolved.source ?? 'metadata',
      locator: 'abstract'
    });
  }

  return spans;
}

export function evidenceSpansFromText({
  text,
  referenceId,
  source,
  offset,
  path,
  idPrefix
}: {
  text: string;
  referenceId: string;
  source: EvidenceSpan['source'];
  offset: number;
  path?: string;
  idPrefix?: string;
}): EvidenceSpan[] {
  return chunkEvidence(text, referenceId, source, offset, path, idPrefix ?? 'E');
}

async function collectFiles(paths: string[]): Promise<string[]> {
  const files: string[] = [];

  for (const path of paths) {
    const info = await stat(path);
    if (info.isDirectory()) {
      for (const entry of await readdir(path)) {
        files.push(...(await collectFiles([join(path, entry)])));
      }
    } else {
      files.push(path);
    }
  }

  return files;
}

async function readEvidenceText(path: string): Promise<string> {
  const ext = extname(path).toLowerCase();

  if (ext === '.pdf') {
    try {
      const pdfParseModule = (await import('pdf-parse')) as {
        default?: (buffer: Buffer) => Promise<{ text: string }>;
      };
      const parsePdf = pdfParseModule.default;
      if (!parsePdf) {
        return '';
      }
      const parsed = await parsePdf(await readFile(path));
      return parsed.text;
    } catch {
      return '';
    }
  }

  if (['.txt', '.md', '.tex', '.xml', '.tei'].includes(ext)) {
    const text = await readFile(path, 'utf8');
    return ext === '.xml' || ext === '.tei' ? stripXml(text) : text;
  }

  return '';
}

function stripXml(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchEvidenceFile(
  file: string,
  text: string,
  references: ReferenceRecord[]
): string | undefined {
  const fileSlug = slugify(basename(file, extname(file)));
  const normalizedText = normalizeTitle(text);

  for (const reference of references) {
    const doiSlug = reference.doi ? slugify(reference.doi) : '';
    if (
      fileSlug === slugify(reference.id) ||
      (doiSlug && fileSlug.includes(doiSlug)) ||
      fileSlug.includes(slugify(reference.title).slice(0, 32))
    ) {
      return reference.id;
    }
  }

  for (const reference of references) {
    const title = normalizeTitle(reference.title);
    if (title && normalizedText.includes(title)) {
      return reference.id;
    }
  }

  return undefined;
}

function chunkEvidence(
  text: string,
  referenceId: string,
  source: EvidenceSpan['source'],
  offset: number,
  path?: string,
  idPrefix = 'E'
): EvidenceSpan[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter((paragraph) => paragraph.length > 30);

  const chunks = paragraphs.length > 0 ? paragraphs : [text.replace(/\s+/g, ' ')];
  const windows = chunks.flatMap((chunk, paragraphIndex) =>
    sentenceWindows(chunk).map((window, windowIndex) => ({
      text: window,
      locator: `paragraph ${paragraphIndex + 1}, sentence window ${
        windowIndex + 1
      }`
    }))
  );

  return windows.map((window, index) => ({
    id: `${idPrefix}${offset + index + 1}`,
    referenceId,
    text: window.text.slice(0, 1800),
    source,
    path,
    locator: window.locator
  }));
}

async function remoteResponseText(
  response: Response,
  contentType: string
): Promise<string> {
  if (contentType.includes('pdf')) {
    try {
      const pdfParseModule = (await import('pdf-parse')) as {
        default?: (buffer: Buffer) => Promise<{ text: string }>;
      };
      const parsePdf = pdfParseModule.default;
      if (!parsePdf) {
        return '';
      }
      const parsed = await parsePdf(Buffer.from(await response.arrayBuffer()));
      return parsed.text;
    } catch {
      return '';
    }
  }

  const text = await response.text();
  return contentType.includes('xml') || contentType.includes('html')
    ? stripXml(text)
    : text;
}

function firstRemoteEvidenceUrl(reference: ResolvedReference): string | undefined {
  const raw = reference.resolved?.raw ?? reference.input.raw ?? {};
  const candidates = [
    raw.content_url,
    raw.oa_url,
    (raw.open_access as { oa_url?: unknown } | undefined)?.oa_url,
    (raw.primary_location as { landing_page_url?: unknown } | undefined)
      ?.landing_page_url
  ];

  return candidates.find(
    (candidate): candidate is string =>
      typeof candidate === 'string' && /^https?:\/\//i.test(candidate)
  );
}

function sentenceWindows(text: string, windowSize = 2): string[] {
  const sentences = splitSentences(text);
  if (sentences.length <= windowSize) {
    return [text];
  }

  const windows: string[] = [];
  for (let index = 0; index < sentences.length; index += 1) {
    windows.push(sentences.slice(index, index + windowSize).join(' '));
  }

  return windows;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}
