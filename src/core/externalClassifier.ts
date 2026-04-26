import { spawn } from 'node:child_process';
import type { ClaimEvidenceClassifier, ClaimVerdict } from '../types.js';

const CLAIM_VERDICTS = new Set<ClaimVerdict>([
  'supported',
  'weak_support',
  'contradicted',
  'unverifiable'
]);

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;

export type CommandClassifierOptions = {
  timeoutMs?: number;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
};

export function createCommandClaimClassifier(
  command: string,
  options: CommandClassifierOptions = {}
): ClaimEvidenceClassifier {
  const argv = parseCommandLine(command);
  if (argv.length === 0) {
    throw new Error('Classifier command cannot be empty.');
  }

  const [executable, ...args] = argv;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxStdoutBytes = options.maxStdoutBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const maxStderrBytes = options.maxStderrBytes ?? DEFAULT_MAX_OUTPUT_BYTES;

  return async (request) => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let outputLimitExceeded = false;
    let timedOut = false;

    const child = spawn(executable, args, {
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdin.on('error', () => {
      // Process errors are reported through the child close/error handlers below.
    });

    child.stdout.on('data', (chunk: string) => {
      stdoutBytes += Buffer.byteLength(chunk);
      if (stdoutBytes > maxStdoutBytes) {
        outputLimitExceeded = true;
        child.kill('SIGTERM');
        return;
      }
      stdout.push(chunk);
    });

    child.stderr.on('data', (chunk: string) => {
      stderrBytes += Buffer.byteLength(chunk);
      if (stderrBytes > maxStderrBytes) {
        outputLimitExceeded = true;
        child.kill('SIGTERM');
        return;
      }
      stderr.push(chunk);
    });

    child.stdin.end(`${JSON.stringify(request)}\n`);

    let result: { code: number | null; signal: NodeJS.Signals | null };
    try {
      result = await waitForClassifier(child);
    } finally {
      clearTimeout(timeout);
    }

    if (timedOut) {
      throw new Error(`Classifier command timed out after ${timeoutMs}ms.`);
    }
    if (outputLimitExceeded) {
      throw new Error('Classifier command exceeded the configured output limit.');
    }
    if (result.code !== 0) {
      const message = stderr.join('').trim();
      throw new Error(
        `Classifier command exited with code ${result.code ?? 'null'}${
          result.signal ? ` and signal ${result.signal}` : ''
        }${message ? `: ${message}` : '.'}`
      );
    }

    return parseClassifierResponse(stdout.join(''));
  };
}

export function parseCommandLine(command: string): string[] {
  const args: string[] = [];
  let current = '';
  let quote: '"' | "'" | undefined;
  let escaping = false;
  let argStarted = false;

  for (const char of command.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      argStarted = true;
      continue;
    }

    if (char === '\\') {
      escaping = true;
      argStarted = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      argStarted = true;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      argStarted = true;
      continue;
    }

    if (/\s/.test(char)) {
      if (argStarted) {
        args.push(current);
        current = '';
        argStarted = false;
      }
      continue;
    }

    current += char;
    argStarted = true;
  }

  if (escaping) {
    current += '\\';
  }
  if (quote) {
    throw new Error('Classifier command has an unterminated quoted argument.');
  }
  if (argStarted) {
    args.push(current);
  }

  return args;
}

function waitForClassifier(
  child: ReturnType<typeof spawn>
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
}

function parseClassifierResponse(output: string): Awaited<
  ReturnType<ClaimEvidenceClassifier>
> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error('Classifier command must write a JSON object to stdout.');
  }

  if (!isObject(parsed)) {
    throw new Error('Classifier command response must be a JSON object.');
  }

  const verdict = parsed.verdict;
  const confidence = parsed.confidence;
  const message = parsed.message;
  if (typeof verdict !== 'string' || !CLAIM_VERDICTS.has(verdict as ClaimVerdict)) {
    throw new Error('Classifier command returned an invalid claim verdict.');
  }
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) {
    throw new Error('Classifier command returned an invalid confidence value.');
  }
  if (typeof message !== 'string') {
    throw new Error('Classifier command returned an invalid message.');
  }

  return {
    verdict: verdict as ClaimVerdict,
    confidence,
    supportingSpanIds: optionalStringArray(
      parsed.supportingSpanIds,
      'supportingSpanIds'
    ),
    contradictedBySpanIds: optionalStringArray(
      parsed.contradictedBySpanIds,
      'contradictedBySpanIds'
    ),
    message
  };
}

function optionalStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`Classifier command returned an invalid ${field} value.`);
  }
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
