/**
 * MARC8 (ANSEL) character encoding codec.
 *
 * MARC8 is signaled by leader byte 9 == ' ' (space); UTF-8 uses 'a'.
 * Combining diacritics in MARC8 PRECEDE the base character; in Unicode they follow.
 * The decoder handles this reordering automatically.
 */

const ESCAPE = 0x1b;
const COMBINING_START = 0xe0;
const COMBINING_END = 0xfe;

// ANSEL Extended Latin → Unicode (non-combining, G1 set, 0xA1–0xDF range)
const NON_COMBINING: ReadonlyMap<number, string> = new Map([
  [0xa1, 'Ł'], // Ł
  [0xa2, 'Ø'], // Ø
  [0xa3, 'Đ'], // Đ
  [0xa4, 'Þ'], // Þ
  [0xa5, 'Æ'], // Æ
  [0xa6, 'Œ'], // Œ
  [0xa7, 'ʹ'], // ʹ modifier letter prime
  [0xa8, '·'], // · middle dot
  [0xa9, '♭'], // ♭ music flat sign
  [0xaa, '®'], // ® registered sign
  [0xab, '±'], // ± plus-minus sign
  [0xac, 'Ơ'], // Ơ
  [0xad, 'Ư'], // Ư
  [0xae, 'ʼ'], // ʼ modifier letter apostrophe
  [0xb0, 'ʻ'], // ʻ modifier letter turned comma
  [0xb1, 'ł'], // ł
  [0xb2, 'ø'], // ø
  [0xb3, 'đ'], // đ
  [0xb4, 'þ'], // þ
  [0xb5, 'æ'], // æ
  [0xb6, 'œ'], // œ
  [0xb7, 'ʺ'], // ʺ modifier letter double prime
  [0xb8, 'ı'], // ı dotless i
  [0xb9, '£'], // £ pound sign
  [0xba, 'ð'], // ð eth
  [0xbb, 'ơ'], // ơ
  [0xbc, 'ư'], // ư
  [0xbf, '°'], // ° degree sign
]);

// ANSEL combining diacritics → Unicode combining characters (G1, 0xE0–0xFE)
// In MARC8 these PRECEDE the base character; decoder swaps to Unicode order.
const COMBINING: ReadonlyMap<number, string> = new Map([
  [0xe0, '̉'], // combining hook above
  [0xe1, '̀'], // combining grave accent
  [0xe2, '́'], // combining acute accent
  [0xe3, '̂'], // combining circumflex accent
  [0xe4, '̃'], // combining tilde
  [0xe5, '̄'], // combining macron
  [0xe6, '̆'], // combining breve
  [0xe7, '̇'], // combining dot above
  [0xe8, '̈'], // combining diaeresis
  [0xe9, '̌'], // combining caron
  [0xea, '̊'], // combining ring above
  [0xeb, '︠'], // combining ligature left half
  [0xec, '︡'], // combining ligature right half
  [0xed, '̕'], // combining comma above right
  [0xee, '̋'], // combining double acute accent
  [0xef, '̐'], // combining candrabindu
  [0xf0, '̧'], // combining cedilla
  [0xf1, '̨'], // combining ogonek
  [0xf2, '̣'], // combining dot below
  [0xf3, '̤'], // combining diaeresis below
  [0xf4, '̥'], // combining ring below
  [0xf5, '̳'], // combining double macron below
  [0xf6, '̲'], // combining low line
  [0xf7, '̦'], // combining comma below
  [0xf8, '̜'], // combining left half ring below
  [0xf9, '̮'], // combining breve below
  [0xfa, '︢'], // combining double tilde left half
  [0xfb, '︣'], // combining double tilde right half
  [0xfe, '̓'], // combining comma above
]);

// Reverse map: Unicode combining char → MARC8 diacritic byte
const COMBINING_REVERSE: ReadonlyMap<string, number> = new Map(
  Array.from(COMBINING.entries()).map(([k, v]) => [v, k])
);

// Reverse map: Unicode non-combining char → MARC8 byte
const NON_COMBINING_REVERSE: ReadonlyMap<string, number> = new Map(
  Array.from(NON_COMBINING.entries()).map(([k, v]) => [v, k])
);

/**
 * Skip an escape sequence starting at `pos` (bytes[pos] === ESC).
 * Returns the index of the first byte after the sequence.
 *
 * MARC8 escape forms:
 *   ESC g/b/p/1        — single-byte designator
 *   ESC ( X / ESC ) X — two-byte intermediate + final
 */
function skipEscape(bytes: Uint8Array, pos: number): number {
  pos++; // skip ESC itself
  if (pos >= bytes.length) return pos;
  const next = bytes[pos];
  if (next === 0x28 || next === 0x29 || next === 0x2c || next === 0x2d) {
    // ESC ( / ) / , / - — intermediate byte, skip one more
    return pos + 2;
  }
  return pos + 1;
}

/**
 * Decode a single MARC8 byte that is not an escape or combining character.
 * ASCII range passes through; extended range uses the lookup table.
 */
function decodeByte(byte: number): string {
  if (byte < 0x80) return String.fromCharCode(byte);
  return NON_COMBINING.get(byte) ?? '�';
}

/**
 * Convert a MARC8-encoded byte sequence to a Unicode string.
 *
 * Combining diacritics are reordered from MARC8 (preceding) to Unicode (following) order.
 * Unrecognised bytes in the extended range are replaced with U+FFFD.
 */
export function marc8ToUnicode(bytes: Uint8Array): string {
  const out: string[] = [];
  let i = 0;

  while (i < bytes.length) {
    const byte = bytes[i]!;

    if (byte === ESCAPE) {
      i = skipEscape(bytes, i);
      continue;
    }

    if (byte >= COMBINING_START && byte <= COMBINING_END) {
      // Diacritic precedes base char in MARC8; collect it, then emit base + diacritic
      const diacritic = COMBINING.get(byte) ?? '';
      i++;
      if (i < bytes.length && bytes[i] !== ESCAPE) {
        const base = decodeByte(bytes[i]!);
        i++;
        out.push(base, diacritic);
      } else {
        // Orphan diacritic at end of field — emit as-is
        if (diacritic) out.push(diacritic);
      }
      continue;
    }

    out.push(decodeByte(byte));
    i++;
  }

  return out.join('');
}

function isCombiningChar(c: string): boolean {
  const code = c.codePointAt(0)!;
  return (code >= 0x0300 && code <= 0x036f) || (code >= 0xfe20 && code <= 0xfe2f);
}

/**
 * Convert a Unicode string to MARC8-encoded bytes.
 *
 * NFD decomposition separates base chars from their combining diacritics.
 * Combining diacritics (which follow the base in Unicode) are output BEFORE
 * the base character, as MARC8 requires.
 * Characters with no MARC8 equivalent are replaced with '?'.
 */
export function unicodeToMarc8(text: string): Uint8Array {
  const decomposed = text.normalize('NFD');
  const bytes: number[] = [];
  let i = 0;

  while (i < decomposed.length) {
    const cp = decomposed.codePointAt(i)!;
    const ch = decomposed[i]!;

    // Orphan combining char (shouldn't happen after NFD from well-formed text)
    if (isCombiningChar(ch)) {
      bytes.push(0x3f);
      i++;
      continue;
    }

    // Look ahead to collect all following combining characters
    let j = i + 1;
    const diacritics: number[] = [];
    while (j < decomposed.length && isCombiningChar(decomposed[j]!)) {
      const combCode = COMBINING_REVERSE.get(decomposed[j]!);
      if (combCode !== undefined) diacritics.push(combCode);
      j++;
    }

    // In MARC8, diacritics precede the base character
    bytes.push(...diacritics);

    // Encode the base character
    if (cp < 0x80) {
      bytes.push(cp);
    } else {
      const baseByte = NON_COMBINING_REVERSE.get(ch);
      bytes.push(baseByte ?? 0x3f);
    }

    i = j;
  }

  return new Uint8Array(bytes);
}
