declare module '@citation-js/core' {
  export const Cite: any;
}

declare module '@citation-js/plugin-bibtex';
declare module '@citation-js/plugin-csl';
declare module '@citation-js/plugin-doi';

declare module 'pdf-parse' {
  const parse: (buffer: Buffer) => Promise<{ text: string }>;
  export default parse;
}
