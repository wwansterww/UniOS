// Shape of the public legal pages (privacy policy, terms of use), rendered by app/(legal)/legal-doc.tsx.

/** A paragraph, a bulleted list or a two-column table (what · how long). */
export type Block = string | { list: string[] } | { table: [string, string][] };

export interface LegalSection {
  id: string;
  title: string;
  blocks: Block[];
}

export interface LegalDoc {
  title: string;
  lead: string;
  sections: LegalSection[];
}
