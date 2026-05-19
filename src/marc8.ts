/**
 * MARC-8 character encoding codec.
 *
 * MARC-8 is signaled by leader byte 9 == ' ' (space); UTF-8 uses 'a'.
 * Decoding tracks escape-designated G0/G1 sets and converts known MARC-8
 * character sets to Unicode. Encoding remains conservative: ASCII plus ANSEL
 * Latin/combining characters are supported, and unsupported characters become '?'.
 */

const ESCAPE = 0x1b;
const REPLACEMENT = '\uFFFD';

type SingleByteSet =
  | 'ascii'
  | 'ansel'
  | 'greek'
  | 'hebrew'
  | 'cyrillic'
  | 'arabic'
  | 'subscript'
  | 'superscript';
type CharSet = SingleByteSet | 'eacc';

interface DecodeState {
  g0: CharSet;
  g1: CharSet;
}

// MARC-8 ANSEL Extended Latin non-combining chars, indexed as G0/G1 positions.
const ANSEL_NON_COMBINING: ReadonlyMap<number, string> = new Map([
  [0x21, 'Ł'],
  [0x22, 'Ø'],
  [0x23, 'Đ'],
  [0x24, 'Þ'],
  [0x25, 'Æ'],
  [0x26, 'Œ'],
  [0x27, 'ʹ'],
  [0x28, '·'],
  [0x29, '♭'],
  [0x2a, '®'],
  [0x2b, '±'],
  [0x2c, 'Ơ'],
  [0x2d, 'Ư'],
  [0x2e, 'ʼ'],
  [0x30, 'ʻ'],
  [0x31, 'ł'],
  [0x32, 'ø'],
  [0x33, 'đ'],
  [0x34, 'þ'],
  [0x35, 'æ'],
  [0x36, 'œ'],
  [0x37, 'ʺ'],
  [0x38, 'ı'],
  [0x39, '£'],
  [0x3a, 'ð'],
  [0x3b, 'ơ'],
  [0x3c, 'ư'],
  [0x3f, '°'],
]);

// ANSEL combining diacritics. MARC-8 places these before the base character.
const ANSEL_COMBINING: ReadonlyMap<number, string> = new Map([
  [0x60, '\u0309'],
  [0x61, '\u0300'],
  [0x62, '\u0301'],
  [0x63, '\u0302'],
  [0x64, '\u0303'],
  [0x65, '\u0304'],
  [0x66, '\u0306'],
  [0x67, '\u0307'],
  [0x68, '\u0308'],
  [0x69, '\u030c'],
  [0x6a, '\u030a'],
  [0x6b, '\ufe20'],
  [0x6c, '\ufe21'],
  [0x6d, '\u0315'],
  [0x6e, '\u030b'],
  [0x6f, '\u0310'],
  [0x70, '\u0327'],
  [0x71, '\u0328'],
  [0x72, '\u0323'],
  [0x73, '\u0324'],
  [0x74, '\u0325'],
  [0x75, '\u0333'],
  [0x76, '\u0332'],
  [0x77, '\u0326'],
  [0x78, '\u031c'],
  [0x79, '\u032e'],
  [0x7a, '\ufe22'],
  [0x7b, '\ufe23'],
  [0x7e, '\u0313'],
]);

const COMBINING_REVERSE: ReadonlyMap<string, number> = new Map(
  Array.from(ANSEL_COMBINING.entries()).map(([k, v]) => [v, k + 0x80])
);

const NON_COMBINING_REVERSE: ReadonlyMap<string, number> = new Map(
  Array.from(ANSEL_NON_COMBINING.entries()).map(([k, v]) => [v, k + 0x80])
);

const BASIC_GREEK: ReadonlyMap<number, string> = tableFromString(
  0x41,
  'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ',
  0x61,
  'αβγδεζηθικλμνξοπρστυφχψω'
);

const BASIC_HEBREW: ReadonlyMap<number, string> = tableFromString(
  0x60,
  'אבגדהוזחטיךכלםמןנסעףפץצקרשת'
);

const BASIC_CYRILLIC: ReadonlyMap<number, string> = tableFromString(
  0x41,
  'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ',
  0x61,
  'абвгдежзийклмнопрстуфхцчшщъыьэюя'
);

const BASIC_ARABIC: ReadonlyMap<number, string> = new Map([
  [0x21, 'ء'],
  [0x22, 'آ'],
  [0x23, 'أ'],
  [0x24, 'ؤ'],
  [0x25, 'إ'],
  [0x26, 'ئ'],
  [0x27, 'ا'],
  [0x28, 'ب'],
  [0x29, 'ة'],
  [0x2a, 'ت'],
  [0x2b, 'ث'],
  [0x2c, 'ج'],
  [0x2d, 'ح'],
  [0x2e, 'خ'],
  [0x2f, 'د'],
  [0x30, 'ذ'],
  [0x31, 'ر'],
  [0x32, 'ز'],
  [0x33, 'س'],
  [0x34, 'ش'],
  [0x35, 'ص'],
  [0x36, 'ض'],
  [0x37, 'ط'],
  [0x38, 'ظ'],
  [0x39, 'ع'],
  [0x3a, 'غ'],
  [0x41, 'ف'],
  [0x42, 'ق'],
  [0x43, 'ك'],
  [0x44, 'ل'],
  [0x45, 'م'],
  [0x46, 'ن'],
  [0x47, 'ه'],
  [0x48, 'و'],
  [0x49, 'ى'],
  [0x4a, 'ي'],
]);

const SUBSCRIPT: ReadonlyMap<number, string> = new Map([
  [0x28, '₍'],
  [0x29, '₎'],
  [0x2b, '₊'],
  [0x2d, '₋'],
  [0x30, '₀'],
  [0x31, '₁'],
  [0x32, '₂'],
  [0x33, '₃'],
  [0x34, '₄'],
  [0x35, '₅'],
  [0x36, '₆'],
  [0x37, '₇'],
  [0x38, '₈'],
  [0x39, '₉'],
]);

const SUPERSCRIPT: ReadonlyMap<number, string> = new Map([
  [0x28, '⁽'],
  [0x29, '⁾'],
  [0x2b, '⁺'],
  [0x2d, '⁻'],
  [0x30, '⁰'],
  [0x31, '¹'],
  [0x32, '²'],
  [0x33, '³'],
  [0x34, '⁴'],
  [0x35, '⁵'],
  [0x36, '⁶'],
  [0x37, '⁷'],
  [0x38, '⁸'],
  [0x39, '⁹'],
  [0x6e, 'ⁿ'],
]);

// WARNING: this table maps only 33 of the ~16,000 official EACC triples.
// Real CJK content in a MARC-8 record will largely decode to U+FFFD. Catalogs
// with Chinese/Japanese/Korean material should be supplied as UTF-8
// (`leader[9] === 'a'`) instead. See README.md for guidance.
//
// The decoder recognizes EACC as a three-byte set; unmapped triples emit
// U+FFFD.
const EACC: ReadonlyMap<number, string> = new Map([
  [0x212121, '一'],
  [0x212122, '丁'],
  [0x212123, '七'],
  [0x212124, '万'],
  [0x212125, '丈'],
  [0x212126, '三'],
  [0x212127, '上'],
  [0x212128, '下'],
  [0x212129, '不'],
  [0x21212a, '与'],
  [0x21212b, '丐'],
  [0x21212c, '丑'],
  [0x21212d, '且'],
  [0x21212e, '世'],
  [0x21212f, '丘'],
  [0x212130, '丙'],
  [0x212131, '业'],
  [0x212132, '丛'],
  [0x212133, '东'],
  [0x212134, '丝'],
  [0x212135, '丞'],
  [0x212136, '丟'],
  [0x212137, '丠'],
  [0x212138, '両'],
  [0x212139, '丢'],
  [0x21213a, '两'],
  [0x21213b, '严'],
  [0x21213c, '並'],
  [0x21213d, '丧'],
  [0x21213e, '丨'],
  [0x21213f, '个'],
  [0x212140, '丫'],
  [0x212141, '中'],
  [0x212142, '丰'],
]);

const SINGLE_BYTE_TABLES: Readonly<Record<SingleByteSet, ReadonlyMap<number, string>>> = {
  ascii: new Map(),
  ansel: mergeMaps(ANSEL_NON_COMBINING, ANSEL_COMBINING),
  greek: BASIC_GREEK,
  hebrew: BASIC_HEBREW,
  cyrillic: BASIC_CYRILLIC,
  arabic: BASIC_ARABIC,
  subscript: SUBSCRIPT,
  superscript: SUPERSCRIPT,
};

function tableFromString(
  ...chunks: [number, string, ...Array<number | string>]
): ReadonlyMap<number, string> {
  const table = new Map<number, string>();
  for (let i = 0; i < chunks.length; i += 2) {
    const start = chunks[i] as number;
    const chars = chunks[i + 1] as string;
    Array.from(chars).forEach((char, offset) => table.set(start + offset, char));
  }
  return table;
}

function mergeMaps(...maps: ReadonlyMap<number, string>[]): ReadonlyMap<number, string> {
  const merged = new Map<number, string>();
  for (const map of maps) {
    for (const [key, value] of map) merged.set(key, value);
  }
  return merged;
}

function isCombiningMark(char: string): boolean {
  const code = char.codePointAt(0)!;
  return (code >= 0x0300 && code <= 0x036f) || (code >= 0xfe20 && code <= 0xfe2f);
}

function normalizedCode(byte: number, isG1: boolean): number {
  return isG1 ? byte - 0x80 : byte;
}

function decodeSingleByte(byte: number, set: SingleByteSet, isG1: boolean): string {
  const code = normalizedCode(byte, isG1);
  if (set === 'ascii')
    return code >= 0x20 && code <= 0x7e ? String.fromCharCode(code) : REPLACEMENT;
  return SINGLE_BYTE_TABLES[set].get(code) ?? REPLACEMENT;
}

function decodeEacc(bytes: Uint8Array, pos: number, isG1: boolean): { char: string; next: number } {
  if (pos + 2 >= bytes.length) return { char: REPLACEMENT, next: bytes.length };
  const b1 = normalizedCode(bytes[pos]!, isG1);
  const b2 = normalizedCode(bytes[pos + 1]!, isG1);
  const b3 = normalizedCode(bytes[pos + 2]!, isG1);
  const key = (b1 << 16) | (b2 << 8) | b3;
  return { char: EACC.get(key) ?? REPLACEMENT, next: pos + 3 };
}

function designate(
  bytes: Uint8Array,
  pos: number,
  state: DecodeState
): { char: string; next: number } {
  if (pos + 1 >= bytes.length) return { char: REPLACEMENT, next: bytes.length };

  const first = bytes[pos + 1]!;

  // Alternate single-byte G0 defaults used in older MARC records.
  if (first === 0x67) return { char: '', next: updateState(state, 'g0', 'greek', pos + 2) };
  if (first === 0x62) return { char: '', next: updateState(state, 'g0', 'hebrew', pos + 2) };
  if (first === 0x70) return { char: '', next: updateState(state, 'g0', 'cyrillic', pos + 2) };
  if (first === 0x73) return { char: '', next: updateState(state, 'g0', 'ascii', pos + 2) };

  let target: keyof DecodeState | undefined;
  let finalIndex: number;

  if (first === 0x28 || first === 0x2c) {
    target = 'g0';
    finalIndex = pos + 2;
  } else if (first === 0x29 || first === 0x2d) {
    target = 'g1';
    finalIndex = pos + 2;
  } else if (first === 0x24) {
    const second = bytes[pos + 2];
    if (second === undefined) return { char: REPLACEMENT, next: bytes.length };
    if (second === 0x28 || second === 0x2c) {
      target = 'g0';
      finalIndex = pos + 3;
    } else if (second === 0x29 || second === 0x2d) {
      target = 'g1';
      finalIndex = pos + 3;
    } else {
      target = 'g0';
      finalIndex = pos + 2;
    }
  } else {
    return { char: REPLACEMENT, next: pos + 2 };
  }

  if (finalIndex >= bytes.length) return { char: REPLACEMENT, next: bytes.length };

  let final = bytes[finalIndex]!;
  if (final === 0x21) {
    finalIndex++;
    if (finalIndex >= bytes.length) return { char: REPLACEMENT, next: bytes.length };
    final = bytes[finalIndex]!;
  }

  const set = characterSetForFinal(final);
  if (!set) return { char: REPLACEMENT, next: finalIndex + 1 };
  return { char: '', next: updateState(state, target, set, finalIndex + 1) };
}

function updateState(
  state: DecodeState,
  target: keyof DecodeState,
  set: CharSet,
  next: number
): number {
  state[target] = set;
  return next;
}

function characterSetForFinal(final: number): CharSet | undefined {
  switch (final) {
    case 0x31:
      return 'eacc';
    case 0x32:
      return 'hebrew';
    case 0x33:
      return 'arabic';
    case 0x34:
      return 'cyrillic';
    case 0x42:
      return 'ascii';
    case 0x45:
      return 'ansel';
    case 0x4e:
      return 'cyrillic';
    case 0x51:
      return 'greek';
    case 0x53:
      return 'greek';
    case 0x62:
      return 'subscript';
    case 0x70:
      return 'superscript';
    default:
      return undefined;
  }
}

/**
 * Convert a MARC-8-encoded byte sequence to a Unicode string.
 *
 * Escape-designated G0/G1 sets are decoded instead of skipped. Unknown bytes,
 * unsupported designators, and unmapped EACC triples produce U+FFFD.
 */
export function marc8ToUnicode(bytes: Uint8Array): string {
  const state: DecodeState = { g0: 'ascii', g1: 'ansel' };
  const out: string[] = [];
  let pendingCombining = '';
  let i = 0;

  const emit = (char: string): void => {
    if (!char) return;
    if (isCombiningMark(char)) {
      pendingCombining += char;
      return;
    }
    out.push(char + pendingCombining);
    pendingCombining = '';
  };

  while (i < bytes.length) {
    const byte = bytes[i]!;

    if (byte === ESCAPE) {
      const result = designate(bytes, i, state);
      emit(result.char);
      i = result.next;
      continue;
    }

    if (byte < 0x20) {
      // Control bytes are passed through as-is. A control byte arriving while
      // pendingCombining is non-empty will incorrectly attach the accumulated
      // diacritics to the control character rather than the next base — control
      // bytes in the middle of field data are non-conformant and rare in practice.
      emit(String.fromCharCode(byte));
      i++;
      continue;
    }

    const isG1 = byte >= 0xa0;
    const set = isG1 ? state.g1 : state.g0;
    if (set === 'eacc') {
      const result = decodeEacc(bytes, i, isG1);
      emit(result.char);
      i = result.next;
      continue;
    }

    emit(decodeSingleByte(byte, set, isG1));
    i++;
  }

  if (pendingCombining) out.push(pendingCombining);
  return out.join('');
}

/**
 * Convert a Unicode string to MARC-8-encoded bytes.
 *
 * This is intentionally conservative. ASCII and ANSEL Latin/combining
 * characters are encoded. Characters with no supported MARC-8 equivalent are
 * replaced with '?'. For programmatic visibility into how much data was lost,
 * use {@link unicodeToMarc8WithStats}.
 */
export function unicodeToMarc8(text: string): Uint8Array {
  return unicodeToMarc8WithStats(text).bytes;
}

/**
 * Result of {@link unicodeToMarc8WithStats}: the encoded bytes plus a count of
 * characters that had no MARC-8 equivalent and were substituted with '?'.
 */
export interface Marc8EncodeResult {
  readonly bytes: Uint8Array;
  readonly lossyCount: number;
}

/**
 * Like {@link unicodeToMarc8} but also reports how many characters were
 * substituted because they have no MARC-8 equivalent. A non-zero `lossyCount`
 * means the round-trip was destructive.
 */
export function unicodeToMarc8WithStats(text: string): Marc8EncodeResult {
  const decomposed = text.normalize('NFD');
  const bytes: number[] = [];
  let lossyCount = 0;
  let i = 0;

  while (i < decomposed.length) {
    const cp = decomposed.codePointAt(i)!;
    const ch = decomposed[i]!;

    if (isCombiningMark(ch)) {
      bytes.push(0x3f);
      lossyCount++;
      i++;
      continue;
    }

    const charWidth = cp > 0xffff ? 2 : 1;
    let j = i + charWidth;
    const diacritics: number[] = [];
    while (j < decomposed.length && isCombiningMark(decomposed[j]!)) {
      const combCode = COMBINING_REVERSE.get(decomposed[j]!);
      if (combCode !== undefined) {
        diacritics.push(combCode);
      } else {
        // Unknown combining mark: substitute with '?' rather than dropping
        // silently, matching the leading-combining-mark behavior above.
        diacritics.push(0x3f);
        lossyCount++;
      }
      j++;
    }

    bytes.push(...diacritics);

    if (cp < 0x80) {
      bytes.push(cp);
    } else {
      const baseByte = NON_COMBINING_REVERSE.get(ch);
      if (baseByte !== undefined) {
        bytes.push(baseByte);
      } else {
        bytes.push(0x3f);
        lossyCount++;
      }
    }

    i = j;
  }

  return { bytes: new Uint8Array(bytes), lossyCount };
}
