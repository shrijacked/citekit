import { describe, expect, it } from 'vitest';
import { extractClaims } from '../src/core/extractClaims.js';

describe('extractClaims', () => {
  it('extracts Markdown and LaTeX citation keys with claim text', () => {
    const claims = extractClaims(
      'Citation audits help authors [@smith2020; @doe2021]. LaTeX works too \\cite{ghost2022}.'
    );

    expect(claims).toHaveLength(2);
    expect(claims[0]).toMatchObject({
      id: 'C1',
      claim: 'Citation audits help authors.',
      citationKeys: ['smith2020', 'doe2021']
    });
    expect(claims[1]).toMatchObject({
      id: 'C2',
      claim: 'LaTeX works too.',
      citationKeys: ['ghost2022']
    });
  });

  it('extracts citations that span multiple manuscript lines', () => {
    const claims = extractClaims(
      [
        'Citation audits help authors',
        'catch unsupported claims [@smith2020;',
        '@doe2021].',
        '',
        'LaTeX multi-line citations work too \\citep{',
        'ghost2022,smith2020',
        '}.'
      ].join('\n'),
      'paper.md'
    );

    expect(claims).toHaveLength(2);
    expect(claims[0]).toMatchObject({
      claim: 'Citation audits help authors catch unsupported claims.',
      citationKeys: ['smith2020', 'doe2021'],
      source: {
        path: 'paper.md',
        line: 1
      }
    });
    expect(claims[1]).toMatchObject({
      claim: 'LaTeX multi-line citations work too.',
      citationKeys: ['ghost2022', 'smith2020'],
      source: {
        path: 'paper.md',
        line: 5
      }
    });
  });

  it('tracks line numbers for later cited sentences in one paragraph', () => {
    const claims = extractClaims(
      [
        'First sentence has no citation.',
        'Second sentence cites evidence [@smith2020].',
        'Third sentence cites more evidence [@doe2021].'
      ].join('\n'),
      'paper.md'
    );

    expect(claims).toHaveLength(2);
    expect(claims[0].source.line).toBe(2);
    expect(claims[1].source.line).toBe(3);
  });

  it('extracts narrative Pandoc citations and complex LaTeX citation forms', () => {
    const claims = extractClaims(
      [
        'According to @smith2020, citation audits improve reference accuracy.',
        'Complex Pandoc forms work too [-@smith2020, pp. 12-14; see also @doe2021].',
        'LaTeX textual citations work too \\citet[see][pp.~12--14]{smith2020,doe2021}.'
      ].join('\n'),
      'paper.md'
    );

    expect(claims).toHaveLength(3);
    expect(claims[0]).toMatchObject({
      claim: 'According to, citation audits improve reference accuracy.',
      citationKeys: ['smith2020']
    });
    expect(claims[1]).toMatchObject({
      claim: 'Complex Pandoc forms work too.',
      citationKeys: ['smith2020', 'doe2021']
    });
    expect(claims[2]).toMatchObject({
      claim: 'LaTeX textual citations work too.',
      citationKeys: ['smith2020', 'doe2021']
    });
  });
});
