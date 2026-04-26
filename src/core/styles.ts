import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';

export type ResolvedCitationStyle = {
  requested: string;
  template: string;
  source: 'builtin' | 'file' | 'packaged';
};

const STYLE_ALIASES: Record<string, string> = {
  acm: 'acm-sig-proceedings',
  'acm-sigconf': 'acm-sig-proceedings',
  ieee: 'ieee',
  nature: 'nature'
};

export async function resolveCitationStyle(
  style: string
): Promise<ResolvedCitationStyle> {
  await import('@citation-js/plugin-csl');
  const core = (await import('@citation-js/core')) as unknown as {
    plugins: {
      config: {
        get(name: '@csl'): {
          templates: {
            has(name: string): boolean;
            add(name: string, template: string): void;
          };
        };
      };
    };
  };
  const config = core.plugins.config.get('@csl');
  const normalized = normalizeStyleId(style);

  if (config.templates.has(normalized)) {
    return {
      requested: style,
      template: normalized,
      source: 'builtin'
    };
  }

  const styleFile = findStyleFile(style, normalized);
  if (styleFile) {
    const template = await readFile(styleFile.path, 'utf8');
    config.templates.add(styleFile.template, template);
    return {
      requested: style,
      template: styleFile.template,
      source: styleFile.source
    };
  }

  throw new Error(`No CSL style template found for "${style}".`);
}

export function normalizeStyleId(style: string): string {
  const trimmed = style.trim();
  const withoutExt = extname(trimmed) === '.csl' ? basename(trimmed, '.csl') : trimmed;
  return STYLE_ALIASES[withoutExt] ?? withoutExt;
}

function findStyleFile(
  requested: string,
  normalized: string
): { path: string; template: string; source: 'file' | 'packaged' } | undefined {
  const direct = resolve(requested);
  if (existsSync(direct)) {
    return {
      path: direct,
      template: `citekit-${normalizeStyleId(basename(direct, '.csl'))}`,
      source: 'file'
    };
  }

  for (const path of [
    join(process.cwd(), 'styles', `${normalized}.csl`),
    new URL(`../../styles/${normalized}.csl`, import.meta.url).pathname
  ]) {
    if (existsSync(path)) {
      return {
        path,
        template: `citekit-${normalized}`,
        source: path.includes(`${process.cwd()}/`) ? 'file' : 'packaged'
      };
    }
  }

  return undefined;
}
