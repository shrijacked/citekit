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
});
