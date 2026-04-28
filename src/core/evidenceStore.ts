import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import type {
  AuditDiagnostic,
  EvidenceSpan,
  ReferenceRecord,
  ResolvedReference
} from '../types.js';
import { normalizeTitle, slugify } from './text.js';

const DEFAULT_REMOTE_TIMEOUT_MS = 10_000;
const DEFAULT_REMOTE_MAX_BYTES = 5 * 1024 * 1024;

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
  return (await loadRemoteEvidenceWithDiagnostics(references, { fetchImpl })).spans;
}

export type RemoteEvidenceLoadOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
  strict?: boolean;
};

export type RemoteEvidenceLoadResult = {
  spans: EvidenceSpan[];
  diagnostics: AuditDiagnostic[];
};

export async function loadRemoteEvidenceWithDiagnostics(
  references: ResolvedReference[],
  options: RemoteEvidenceLoadOptions = {}
): Promise<RemoteEvidenceLoadResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_REMOTE_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_REMOTE_MAX_BYTES;
  const spans: EvidenceSpan[] = [];
  const diagnostics: AuditDiagnostic[] = [];

  for (const reference of references) {
    const { url, unsupportedUrl } = firstRemoteEvidenceUrl(reference);
    if (!url) {
      if (unsupportedUrl) {
        recordRemoteDiagnostic({
          diagnostics,
          code: 'unsupported_protocol',
          reference,
          url: unsupportedUrl,
          message: `Remote evidence URL uses an unsupported protocol: ${unsupportedUrl}`,
          strict: options.strict
        });
      }
      continue;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetchImpl(url, {
        signal: controller.signal,
        headers: {
          Accept:
            'text/plain, text/xml, application/xml, application/pdf, text/html;q=0.8, */*;q=0.1'
        }
      });
      if (!response.ok) {
        recordRemoteDiagnostic({
          diagnostics,
          code: 'http_error',
          reference,
          url,
          message: `Remote evidence fetch failed with HTTP ${response.status}${
            response.statusText ? ` ${response.statusText}` : ''
          }.`,
          strict: options.strict
        });
        continue;
      }
      const contentType = response.headers.get('content-type') ?? '';
      const text = await remoteResponseText(response, contentType, maxBytes);
      if (!text.trim()) {
        recordRemoteDiagnostic({
          diagnostics,
          code: 'empty_response',
          reference,
          url,
          message: 'Remote evidence response did not contain extractable text.',
          strict: options.strict
        });
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
    } catch (error) {
      if (error instanceof RemoteEvidenceDiagnosticError) {
        throw error;
      }
      const code = remoteErrorCode(error, controller.signal);
      recordRemoteDiagnostic({
        diagnostics,
        code,
        reference,
        url,
        message: remoteErrorMessage(code, url, error, timeoutMs, maxBytes),
        strict: options.strict
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  return { spans, diagnostics };
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
  contentType: string,
  maxBytes: number
): Promise<string> {
  const bytes = await remoteResponseBytes(response, maxBytes);
  if (contentType.includes('pdf')) {
    try {
      const pdfParseModule = (await import('pdf-parse')) as {
        default?: (buffer: Buffer) => Promise<{ text: string }>;
      };
      const parsePdf = pdfParseModule.default;
      if (!parsePdf) {
        return '';
      }
      const parsed = await parsePdf(Buffer.from(bytes));
      return parsed.text;
    } catch {
      return '';
    }
  }

  const text = new TextDecoder().decode(bytes);
  return contentType.includes('xml') || contentType.includes('html')
    ? stripXml(text)
    : text;
}

async function remoteResponseBytes(
  response: Response,
  maxBytes: number
): Promise<Uint8Array> {
  const contentLength = response.headers.get('content-length');
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new RemoteEvidenceReadError(
      `Remote evidence response is larger than ${maxBytes} bytes.`,
      'response_too_large'
    );
  }

  if (!response.body) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) {
      throw new RemoteEvidenceReadError(
        `Remote evidence response is larger than ${maxBytes} bytes.`,
        'response_too_large'
      );
    }
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new RemoteEvidenceReadError(
        `Remote evidence response is larger than ${maxBytes} bytes.`,
        'response_too_large'
      );
    }
    chunks.push(value);
  }

  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function firstRemoteEvidenceUrl(reference: ResolvedReference): {
  url?: string;
  unsupportedUrl?: string;
} {
  const raw = reference.resolved?.raw ?? reference.input.raw ?? {};
  const primaryLocation = remoteLocation(raw.primary_location);
  const bestOaLocation = remoteLocation(raw.best_oa_location);
  const locations = Array.isArray(raw.locations)
    ? raw.locations.map(remoteLocation).filter((location): location is RemoteLocation =>
        Boolean(location)
      )
    : [];
  const candidates = [
    raw.content_url,
    bestOaLocation?.pdf_url,
    primaryLocation?.pdf_url,
    ...locations.map((location) => location.pdf_url),
    (raw.open_access as { oa_url?: unknown } | undefined)?.oa_url,
    raw.oa_url,
    bestOaLocation?.landing_page_url,
    primaryLocation?.landing_page_url,
    ...locations.map((location) => location.landing_page_url)
  ];

  const strings = candidates.filter(
    (candidate): candidate is string => typeof candidate === 'string'
  );
  return {
    url: strings.find((candidate) => /^https?:\/\//i.test(candidate)),
    unsupportedUrl: strings.find((candidate) => /^[a-z][a-z0-9+.-]*:/i.test(candidate))
  };
}

class RemoteEvidenceReadError extends Error {
  constructor(
    message: string,
    readonly code: AuditDiagnostic['code']
  ) {
    super(message);
  }
}

class RemoteEvidenceDiagnosticError extends Error {}

function remoteErrorCode(
  error: unknown,
  signal: AbortSignal
): AuditDiagnostic['code'] {
  if (error instanceof RemoteEvidenceReadError) {
    return error.code;
  }
  if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
    return 'timeout';
  }
  return 'fetch_error';
}

function remoteErrorMessage(
  code: AuditDiagnostic['code'],
  url: string,
  error: unknown,
  timeoutMs: number,
  maxBytes: number
): string {
  if (code === 'timeout') {
    return `Remote evidence fetch timed out after ${timeoutMs}ms: ${url}`;
  }
  if (code === 'response_too_large') {
    return `Remote evidence response exceeded ${maxBytes} bytes: ${url}`;
  }
  const detail = error instanceof Error ? error.message : String(error);
  return `Remote evidence fetch failed for ${url}: ${detail}`;
}

function remoteDiagnostic({
  diagnostics,
  code,
  reference,
  url,
  message
}: {
  diagnostics: AuditDiagnostic[];
  code: AuditDiagnostic['code'];
  reference: ResolvedReference;
  url: string;
  message: string;
}): AuditDiagnostic {
  return {
    id: `D${diagnostics.length + 1}`,
    severity: 'warning',
    category: 'remote_evidence',
    code,
    referenceId: reference.input.id,
    resolverSource: reference.source,
    url,
    message
  };
}

function recordRemoteDiagnostic({
  diagnostics,
  code,
  reference,
  url,
  message,
  strict
}: {
  diagnostics: AuditDiagnostic[];
  code: AuditDiagnostic['code'];
  reference: ResolvedReference;
  url: string;
  message: string;
  strict?: boolean;
}): AuditDiagnostic {
  const diagnostic = remoteDiagnostic({
    diagnostics,
    code,
    reference,
    url,
    message
  });
  diagnostics.push(diagnostic);
  if (strict) {
    throw new RemoteEvidenceDiagnosticError(diagnostic.message);
  }
  return diagnostic;
}

type RemoteLocation = {
  pdf_url?: unknown;
  landing_page_url?: unknown;
};

function remoteLocation(value: unknown): RemoteLocation | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as RemoteLocation;
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
