export interface MetadataTermCandidate {
  label: string;
  source: 'title' | 'keyword';
  reason: string;
}

const GENERIC_TERMS = new Set([
  'daten',
  'datenprodukt',
  'datensatz',
  'data',
  'dataset',
  'synthetisch',
  'synthetic',
]);
const CONTEXT_MARKERS = new Set(['für', 'je', 'nach', 'per', 'pro']);
const GENERIC_TITLE_SUFFIXES = [
  'bestand',
  'daten',
  'datensatz',
  'indikatoren',
  'register',
  'statistik',
  'übersicht',
  'verzeichnis',
];

/**
 * Extracts a small, deterministic set of editable term candidates from the
 * current form values. This deliberately does not pretend to be linguistic AI:
 * it keeps the source visible and leaves definitions and inflection to the user.
 */
export function metadataTermCandidates(
  title: string,
  keywords: string | readonly string[],
  requestedLimit = 3,
): readonly MetadataTermCandidate[] {
  const limit = Math.min(3, Math.max(0, requestedLimit));
  if (!limit) return [];

  const candidates: MetadataTermCandidate[] = [];
  const seen = new Set<string>();
  const add = (label: string, source: MetadataTermCandidate['source'], reason: string) => {
    const cleaned = normalizeWhitespace(label).replace(/^[\s,.;:()\[\]-]+|[\s,.;:()\[\]-]+$/g, '');
    const key = cleaned.toLocaleLowerCase('de-CH');
    if (cleaned.length < 3 || GENERIC_TERMS.has(key) || seen.has(key)) return;
    seen.add(key);
    candidates.push({ label: cleaned, source, reason });
  };

  for (const segment of title.split(/[\u2013\u2014:;/|]+/)) {
    const label = titleCandidate(segment);
    if (label) add(label, 'title', 'Aus dem aktuell eingegebenen Produkttitel abgeleitet.');
  }

  const keywordValues = typeof keywords === 'string' ? keywords.split(/[,;]+/) : keywords;
  for (const keyword of keywordValues) {
    const label = normalizeWhitespace(keyword);
    add(label, 'keyword', `Aus dem aktuellen Keyword «${label}» abgeleitet.`);
  }

  return candidates.slice(0, limit);
}

function titleCandidate(value: string): string {
  const tokens = value.match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu) ?? [];
  const contextIndex = tokens.findIndex((token) => CONTEXT_MARKERS.has(token.toLocaleLowerCase('de-CH')));
  const scoped = contextIndex > 0 ? tokens.slice(0, contextIndex) : [...tokens];
  while (scoped.length > 1 && isGenericTitleToken(scoped[0])) scoped.shift();
  return normalizeWhitespace(scoped.join(' '));
}

function isGenericTitleToken(value: string): boolean {
  const normalized = value.toLocaleLowerCase('de-CH');
  return GENERIC_TERMS.has(normalized)
    || GENERIC_TITLE_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}
