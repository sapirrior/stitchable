import { ANSI_ESCAPE_REGEX, stripAnsi } from './ansi.js';

/**
 * Global grapheme segmenter using standard ECMAScript Intl API.
 */
const graphemeSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

/**
 * Bounded cache storing computed display widths for unique graphemes.
 */
const graphemeWidthCache = new Map<string, number>();

/**
 * Maximum capacity for the grapheme width cache.
 */
const MAX_CACHE_SIZE = 4096;

/**
 * Checks whether a Unicode code point is non-printing or zero-width.
 *
 * @param codePoint - The Unicode code point to test.
 * @returns True if the code point occupies zero terminal columns.
 */
function isZeroWidthCodePoint(codePoint: number): boolean {
  // Fast path for printable ASCII
  if (codePoint >= 0x20 && codePoint < 0x7f) {
    return false;
  }
  // Soft hyphen
  if (codePoint === 0x00ad) {
    return true;
  }
  // Control characters: C0 (0x00-0x1F), DEL (0x7F), C1 (0x80-0x9F)
  if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) {
    return true;
  }
  // Zero-width space, joiners, formatting marks (U+200B - U+200F)
  if (codePoint >= 0x200b && codePoint <= 0x200f) {
    return true;
  }
  // Line / paragraph separators, directional formatting (U+2028 - U+202E)
  if (codePoint >= 0x2028 && codePoint <= 0x202e) {
    return true;
  }
  // Word joiner and invisible formatters (U+2060 - U+206F)
  if (codePoint >= 0x2060 && codePoint <= 0x206f) {
    return true;
  }
  // Byte order mark (BOM)
  if (codePoint === 0xfeff) {
    return true;
  }
  // Variation selectors: VS1-VS16 (U+FE00 - U+FE0F), VS17-VS256 (U+E0100 - U+E01EF)
  if (
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
    (codePoint >= 0xe0100 && codePoint <= 0xe01ef)
  ) {
    return true;
  }
  // Combining diacritical marks
  if (
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0x1ab0 && codePoint <= 0x1aff) ||
    (codePoint >= 0x1dc0 && codePoint <= 0x1dff) ||
    (codePoint >= 0x20d0 && codePoint <= 0x20ff) ||
    (codePoint >= 0xfe20 && codePoint <= 0xfe2f)
  ) {
    return true;
  }
  // Indic combining marks (Devanagari through Malayalam: U+0900 - U+0D4F)
  if (codePoint >= 0x0900 && codePoint <= 0x0d4f) {
    const offset = codePoint & 0x7f;
    if (offset <= 0x03) return true;
    if (offset >= 0x3a && offset <= 0x4f) return true;
    if (offset >= 0x51 && offset <= 0x57) return true;
    if (offset >= 0x62 && offset <= 0x63) return true;
  }
  // Thai combining marks
  if (
    codePoint === 0x0e31 ||
    (codePoint >= 0x0e34 && codePoint <= 0x0e3a) ||
    (codePoint >= 0x0e47 && codePoint <= 0x0e4e)
  ) {
    return true;
  }
  // Lao combining marks
  if (
    codePoint === 0x0eb1 ||
    (codePoint >= 0x0eb4 && codePoint <= 0x0ebc) ||
    (codePoint >= 0x0ec8 && codePoint <= 0x0ecd)
  ) {
    return true;
  }
  // Arabic combining marks and formatting
  if (
    (codePoint >= 0x0600 && codePoint <= 0x0605) ||
    (codePoint >= 0x0610 && codePoint <= 0x061a) ||
    (codePoint >= 0x064b && codePoint <= 0x065f) ||
    codePoint === 0x0670 ||
    codePoint === 0x06dd ||
    codePoint === 0x070f ||
    codePoint === 0x08e2
  ) {
    return true;
  }
  // Surrogates and tag characters
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) return true;
  if (codePoint >= 0xe0000 && codePoint <= 0xe007f) return true;

  return false;
}

/**
 * Checks whether a Unicode code point is fullwidth or wide in East Asian typography.
 *
 * @param codePoint - The Unicode code point to test.
 * @returns True if the code point occupies two terminal columns.
 */
function isEastAsianWideCodePoint(codePoint: number): boolean {
  if (codePoint < 0x1100) {
    return false;
  }
  return (
    // Hangul Jamo initial consonants
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    codePoint === 0x2329 ||
    codePoint === 0x232a ||
    // CJK Radicals, Symbols and Punctuation
    (codePoint >= 0x2e80 && codePoint <= 0x303e) ||
    // Hiragana, Katakana, Bopomofo, CJK Unified Ideographs, etc.
    (codePoint >= 0x3040 && codePoint <= 0xa4cf) ||
    // Hangul Syllables
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    // CJK Compatibility Ideographs
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    // Vertical Forms
    (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
    // CJK Compatibility Forms & Small Form Variants
    (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
    // Fullwidth ASCII Variants (U+FF01 - U+FF60)
    (codePoint >= 0xff01 && codePoint <= 0xff60) ||
    // Fullwidth Symbol Variants
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    // CJK Unified Ideographs Extensions (SIP, TIP)
    (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  );
}

/**
 * Checks whether a Unicode code point belongs to an emoji presentation range.
 *
 * @param codePoint - The Unicode code point to test.
 * @returns True if the code point is generally displayed as a wide emoji.
 */
function isEmojiCodePoint(codePoint: number): boolean {
  return (
    codePoint === 0x231a ||
    codePoint === 0x231b ||
    codePoint === 0x23f0 ||
    codePoint === 0x23f3 ||
    (codePoint >= 0x2600 && codePoint <= 0x27bf) ||
    (codePoint >= 0x1f300 && codePoint <= 0x1faff)
  );
}

/**
 * Pure TypeScript fallback to calculate visual display width for a single grapheme cluster.
 *
 * @param grapheme - The grapheme cluster string to evaluate.
 * @returns The integer column width (0, 1, or 2).
 */
function computeGraphemeWidthJavaScript(grapheme: string): number {
  if (!grapheme) {
    return 0;
  }
  const firstCodePoint = grapheme.codePointAt(0)!;
  if (isZeroWidthCodePoint(firstCodePoint)) {
    return 0;
  }
  // Check regional indicator flag pairs (U+1F1E6 - U+1F1FF)
  if (firstCodePoint >= 0x1f1e6 && firstCodePoint <= 0x1f1ff) {
    let count = 0;
    for (const _ of grapheme) {
      count++;
    }
    return count === 1 ? 1 : 2;
  }
  if (isEastAsianWideCodePoint(firstCodePoint) || isEmojiCodePoint(firstCodePoint)) {
    return 2;
  }
  return 1;
}

/**
 * Cached reference to Bun's native string width calculation if available.
 */
const bunNativeStringWidth: ((str: string, options?: { ambiguousIsNarrow?: boolean }) => number) | null =
  typeof Bun !== 'undefined' && typeof Bun.stringWidth === 'function'
    ? (Bun.stringWidth as (str: string, options?: { ambiguousIsNarrow?: boolean }) => number)
    : null;

const bunStringWidthOptions = { ambiguousIsNarrow: true } as const;

/**
 * Expands tab characters (\t) to spaces advancing to the next tab stop.
 *
 * @param text - The raw text containing tab characters.
 * @param tabWidth - Number of spaces per tab stop (defaults to 4).
 * @returns The text with all tab characters replaced by visual spaces.
 */
export function expandTabs(text: string, tabWidth = 4): string {
  if (!text || !text.includes('\t')) return text;
  let result = '';
  let col = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '\t') {
      const spaces = tabWidth - (col % tabWidth);
      result += ' '.repeat(spaces);
      col += spaces;
    } else if (ch === '\n' || ch === '\r') {
      result += ch;
      col = 0;
    } else {
      result += ch;
      col += 1;
    }
  }
  return result;
}

/**
 * Splits text into user-perceived grapheme clusters using standard ECMAScript Intl.
 *
 * @param text - The string to segment.
 * @returns Array of grapheme cluster segments.
 */
export function segmentGraphemes(text: string): string[] {
  if (!text) return [];
  const segments: string[] = [];
  for (const segment of graphemeSegmenter.segment(text)) {
    segments.push(segment.segment);
  }
  return segments;
}

/**
 * Computes display cell width of a single grapheme cluster.
 *
 * @param grapheme - The grapheme cluster string to measure.
 * @returns Visual terminal cell width (0, 1, or 2).
 */
export function graphemeWidth(grapheme: string): number {
  if (!grapheme) return 0;
  // ASCII fast-path
  if (grapheme.length === 1) {
    const code = grapheme.charCodeAt(0);
    if (code >= 32 && code <= 126) return 1;
    if (code < 32 || code === 127) return 0;
  }

  const cached = graphemeWidthCache.get(grapheme);
  if (cached !== undefined) return cached;

  const w = bunNativeStringWidth
    ? bunNativeStringWidth(grapheme, bunStringWidthOptions)
    : computeGraphemeWidthJavaScript(grapheme);

  if (graphemeWidthCache.size < MAX_CACHE_SIZE) {
    graphemeWidthCache.set(grapheme, w);
  }
  return w;
}

/**
 * Computes total visible cell width of a string (ignoring ANSI SGR escape codes).
 *
 * @param text - String containing plain text or ANSI escape codes.
 * @returns Total visual terminal column count.
 */
export function visibleWidth(text: string): number {
  if (!text) return 0;
  const clean = stripAnsi(text);
  if (clean.length === 0) return 0;

  // Pure ASCII fast-path
  let isPureAscii = true;
  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i);
    if (code < 32 || code >= 127) {
      isPureAscii = false;
      break;
    }
  }
  if (isPureAscii) {
    return clean.length;
  }

  let total = 0;
  for (const g of segmentGraphemes(clean)) {
    total += graphemeWidth(g);
  }
  return total;
}

/**
 * Computes 1-indexed column for a given logical visible character offset (skipping ANSI escapes).
 *
 * @param text - The styled or plain string.
 * @param charOffset - Logical character offset.
 * @returns 1-indexed visual terminal column.
 */
export function visibleColumnAtOffset(text: string, charOffset: number): number {
  if (charOffset <= 0 || !text) return 1;
  const ansiRegex = new RegExp(ANSI_ESCAPE_REGEX.source, 'g');
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let col = 1;
  let countedChars = 0;

  const processPlain = (plain: string) => {
    for (const g of segmentGraphemes(plain)) {
      if (countedChars >= charOffset) return;
      col += graphemeWidth(g);
      countedChars += g.length;
    }
  };

  while ((match = ansiRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      processPlain(text.slice(lastIndex, match.index));
      if (countedChars >= charOffset) return col;
    }
    lastIndex = ansiRegex.lastIndex;
  }

  if (lastIndex < text.length && countedChars < charOffset) {
    processPlain(text.slice(lastIndex));
  }

  return col;
}
