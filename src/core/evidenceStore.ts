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

    spans.push(...chunkEvidence(text, referenceId, file, spans.length));
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
  path: string,
  offset: number
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
    id: `E${offset + index + 1}`,
    referenceId,
    text: window.text.slice(0, 1800),
    source: 'user_file',
    path,
    locator: window.locator
  }));
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
