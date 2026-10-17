export interface PageContext {
  /** The site the user is applying on, e.g. "careers.example.com". */
  host: string;
  /** The page title's leading part, usually the role. */
  heading: string;
  /** The rest of the page title, usually the organisation, if present. */
  subheading: string | null;
}

/** Title separators sites commonly use between role and organisation. */
const SEPARATOR = /\s+[·|•—–-]\s+/;

export function readPageContext(doc: Document = document): PageContext {
  const host = doc.location.hostname || 'this page';
  const [heading = '', ...rest] = doc.title.trim().split(SEPARATOR);
  return {
    host,
    heading: heading || host,
    subheading: rest.length > 0 ? rest.join(' · ') : null,
  };
}
