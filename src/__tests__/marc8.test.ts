import { describe, it, expect } from 'vitest';
import { marc8ToUnicode, unicodeToMarc8 } from '../marc8';
import { parseMarcRecord } from '../parser';
import { serializeMarcRecord } from '../serializer';
import { isDataField } from '../types';
import type { MarcRecord, ControlField, DataField } from '../types';

const ESC = 0x1b;
const SUBFIELD_DELIMITER = 0x1f;
const FIELD_TERMINATOR = 0x1e;
const RECORD_TERMINATOR = 0x1d;

function encodeAscii(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function concatBytes(...segments: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(segments.reduce((sum, segment) => sum + segment.length, 0));
  let offset = 0;
  for (const segment of segments) {
    result.set(segment, offset);
    offset += segment.length;
  }
  return result;
}

function buildMarc8Record(
  fields: readonly (ControlField | DataField | { tag: string; rawBytes: Uint8Array })[]
): Uint8Array {
  const directoryEntries: string[] = [];
  const dataSegments: Uint8Array[] = [];
  let position = 0;

  for (const field of fields) {
    let tag: string;
    let data: Uint8Array;
    if ('rawBytes' in field) {
      tag = field.tag;
      data = field.rawBytes;
    } else if ('data' in field) {
      tag = field.tag;
      data = encodeAscii(field.data);
    } else {
      tag = field.tag;
      data = concatBytes(
        encodeAscii(field.indicator1 + field.indicator2),
        ...field.subfields.map((sf) =>
          concatBytes(
            new Uint8Array([SUBFIELD_DELIMITER]),
            encodeAscii(sf.code),
            encodeAscii(sf.value)
          )
        )
      );
    }

    const fieldLength = data.length + 1;
    directoryEntries.push(
      tag + fieldLength.toString().padStart(4, '0') + position.toString().padStart(5, '0')
    );
    dataSegments.push(data, new Uint8Array([FIELD_TERMINATOR]));
    position += fieldLength;
  }

  const directory = encodeAscii(directoryEntries.join(''));
  const baseAddress = 24 + directory.length + 1;
  const data = concatBytes(...dataSegments);
  const recordLength = baseAddress + data.length + 1;
  const leader = `${recordLength.toString().padStart(5, '0')}nam  22${baseAddress
    .toString()
    .padStart(5, '0')}   4500`;
  const result = new Uint8Array(recordLength);
  result.set(encodeAscii(leader), 0);
  result.set(directory, 24);
  result[24 + directory.length] = FIELD_TERMINATOR;
  result.set(data, baseAddress);
  result[recordLength - 1] = RECORD_TERMINATOR;
  return result;
}

describe('marc8ToUnicode', () => {
  it('passes ASCII characters through unchanged', () => {
    const bytes = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
    expect(marc8ToUnicode(bytes)).toBe('Hello');
  });

  it('decodes extended Latin single-byte characters', () => {
    // 0xA1 = Ł, 0xB1 = ł
    const bytes = new Uint8Array([0xa1, 0xb1]);
    expect(marc8ToUnicode(bytes)).toBe('Łł');
  });

  it('decodes common extended characters', () => {
    expect(marc8ToUnicode(new Uint8Array([0xa5]))).toBe('Æ');
    expect(marc8ToUnicode(new Uint8Array([0xb5]))).toBe('æ');
    expect(marc8ToUnicode(new Uint8Array([0xa6]))).toBe('Œ');
    expect(marc8ToUnicode(new Uint8Array([0xb6]))).toBe('œ');
    expect(marc8ToUnicode(new Uint8Array([0xb9]))).toBe('£');
  });

  it('decodes combining diacritics with reordering (diacritic follows base in output)', () => {
    // MARC8: 0xE2 (acute accent) + 0x65 ('e') → Unicode: 'e' + combining acute = é
    const bytes = new Uint8Array([0xe2, 0x65]);
    const result = marc8ToUnicode(bytes);
    // Should produce 'e' + combining acute accent (U+0301)
    expect(result.startsWith('e')).toBe(true);
    expect(result.codePointAt(1)).toBe(0x0301);
  });

  it('decodes grave accent combining', () => {
    // 0xE1 (grave) + 0x61 ('a') → à
    const bytes = new Uint8Array([0xe1, 0x61]);
    const result = marc8ToUnicode(bytes);
    expect(result.normalize('NFC')).toBe('à');
  });

  it('decodes umlaut/diaeresis combining', () => {
    // 0xE8 (diaeresis) + 0x75 ('u') → ü
    const bytes = new Uint8Array([0xe8, 0x75]);
    const result = marc8ToUnicode(bytes);
    expect(result.normalize('NFC')).toBe('ü');
  });

  it('handles orphan diacritic at end gracefully', () => {
    const bytes = new Uint8Array([0xe2]); // acute accent with nothing after
    expect(() => marc8ToUnicode(bytes)).not.toThrow();
  });

  it('does not throw on bytes not in the MARC8 table', () => {
    // 0x80 is in the extended range but has no defined MARC8 mapping
    const bytes = new Uint8Array([0x80]);
    expect(() => marc8ToUnicode(bytes)).not.toThrow();
    // Result is some placeholder character; exact value is implementation detail
    expect(typeof marc8ToUnicode(bytes)).toBe('string');
  });

  it('skips escape sequences', () => {
    // ESC g (switch to Greek) followed by ASCII 'a'
    const bytes = new Uint8Array([0x1b, 0x67, 0x61]);
    expect(() => marc8ToUnicode(bytes)).not.toThrow();
  });

  it('decodes escape-designated Greek instead of dropping text', () => {
    expect(
      marc8ToUnicode(new Uint8Array([ESC, 0x28, 0x51, 0x61, 0x62, ESC, 0x28, 0x42, 0x41]))
    ).toBe('αβA');
  });

  it('decodes escape-designated Hebrew', () => {
    expect(marc8ToUnicode(new Uint8Array([ESC, 0x28, 0x32, 0x60, 0x61, 0x62]))).toBe('אבג');
  });

  it('decodes escape-designated Cyrillic', () => {
    expect(marc8ToUnicode(new Uint8Array([ESC, 0x28, 0x4e, 0x61, 0x62, 0x63]))).toBe('абв');
  });

  it('decodes escape-designated Arabic', () => {
    expect(marc8ToUnicode(new Uint8Array([ESC, 0x28, 0x33, 0x27, 0x28, 0x2a]))).toBe('ابت');
  });

  it('decodes escape-designated subscript and superscript sets', () => {
    expect(marc8ToUnicode(new Uint8Array([ESC, 0x28, 0x62, 0x32, ESC, 0x28, 0x70, 0x33]))).toBe(
      '₂³'
    );
  });

  it('decodes mapped EACC triples and replaces unmapped triples', () => {
    expect(marc8ToUnicode(new Uint8Array([ESC, 0x24, 0x31, 0x21, 0x21, 0x41]))).toBe('中');
    expect(marc8ToUnicode(new Uint8Array([ESC, 0x24, 0x31, 0x7e, 0x7e, 0x7e]))).toBe('�');
  });

  it('emits replacement characters for malformed or unknown escape sequences', () => {
    expect(marc8ToUnicode(new Uint8Array([ESC]))).toBe('�');
    expect(marc8ToUnicode(new Uint8Array([ESC, 0x28]))).toBe('�');
    expect(marc8ToUnicode(new Uint8Array([ESC, 0x28, 0x7e, 0x41]))).toBe('�A');
  });

  it('does not lose characters after unsupported designators', () => {
    expect(marc8ToUnicode(new Uint8Array([ESC, 0x78, 0x41, 0x42]))).toBe('�AB');
  });

  it('decodes legacy shortcut ESC g (Greek)', () => {
    expect(marc8ToUnicode(new Uint8Array([ESC, 0x67, 0x61, 0x62]))).toBe('αβ');
  });

  it('decodes legacy shortcut ESC b (Hebrew)', () => {
    expect(marc8ToUnicode(new Uint8Array([ESC, 0x62, 0x60, 0x61]))).toBe('אב');
  });

  it('decodes legacy shortcut ESC p (Cyrillic)', () => {
    expect(marc8ToUnicode(new Uint8Array([ESC, 0x70, 0x61, 0x62]))).toBe('аб');
  });

  it('decodes legacy shortcut ESC s (ASCII)', () => {
    expect(marc8ToUnicode(new Uint8Array([ESC, 0x73, 0x41, 0x42]))).toBe('AB');
  });

  it('decodes multiple combining marks on one base character', () => {
    // MARC8: 0xE5 (macron) + 0xE8 (diaeresis) + 0x61 ('a') → a + macron + diaeresis
    const bytes = new Uint8Array([0xe5, 0xe8, 0x61]);
    const result = marc8ToUnicode(bytes);
    expect(result[0]).toBe('a');
    expect(result.codePointAt(1)).toBe(0x0304); // combining macron
    expect(result.codePointAt(2)).toBe(0x0308); // combining diaeresis
  });

  it('designates G1 set via ESC ) and decodes G1 bytes', () => {
    // ESC ) Q designates Greek to G1; byte 0xE1 (≥ 0xA0, so G1) normalizes to 0x61 → α
    expect(marc8ToUnicode(new Uint8Array([ESC, 0x29, 0x51, 0xe1]))).toBe('α');
  });

  it('designates G0 via alternate ESC , intermediate', () => {
    // ESC , Q is equivalent to ESC ( Q for G0 designation
    expect(marc8ToUnicode(new Uint8Array([ESC, 0x2c, 0x51, 0x61]))).toBe('α');
  });

  it('designates EACC to G0 via standard ESC $ ( form', () => {
    // ESC $ ( 1 is the canonical EACC G0 designation; bytes 0x21 0x21 0x41 → 中
    expect(marc8ToUnicode(new Uint8Array([ESC, 0x24, 0x28, 0x31, 0x21, 0x21, 0x41]))).toBe('中');
  });

  it('designates EACC to G1 via ESC $ ) and decodes G1 EACC bytes', () => {
    // ESC $ ) 1 designates EACC to G1; G1 bytes 0xA1 0xA1 0xC1 normalize to 0x21 0x21 0x41 → 中
    expect(
      marc8ToUnicode(new Uint8Array([ESC, 0x24, 0x29, 0x31, 0xa1, 0xa1, 0xc1]))
    ).toBe('中');
  });

  it('emits replacement for ESC $ when no byte follows', () => {
    expect(marc8ToUnicode(new Uint8Array([ESC, 0x24]))).toBe('�');
  });

  it('consumes 0x21 intermediate byte in designation', () => {
    // ESC ( ! Q — 0x21 is an optional intermediate; final byte 0x51 → Greek
    expect(marc8ToUnicode(new Uint8Array([ESC, 0x28, 0x21, 0x51, 0x61]))).toBe('α');
  });

  it('emits replacement when truncated after 0x21 intermediate', () => {
    // ESC ( ! with nothing after the 0x21
    expect(marc8ToUnicode(new Uint8Array([ESC, 0x28, 0x21]))).toBe('�');
  });

  it('ESC ( B designates ASCII to G0', () => {
    expect(marc8ToUnicode(new Uint8Array([ESC, 0x28, 0x42, 0x41]))).toBe('A');
  });

  it('ESC ( E designates ANSEL to G0 (0x45 case)', () => {
    // After ESC ( E, G0 = ANSEL; byte 0x21 → Ł
    expect(marc8ToUnicode(new Uint8Array([ESC, 0x28, 0x45, 0x21]))).toBe('Ł');
  });

  it('emits replacement for unmapped byte in an active character set', () => {
    // After ESC ( E (ANSEL G0), byte 0x2F has no entry in the ANSEL table
    expect(marc8ToUnicode(new Uint8Array([ESC, 0x28, 0x45, 0x2f]))).toBe('�');
  });

  it('ESC ( 4 designates Cyrillic alt to G0 (0x34 case)', () => {
    // final byte 0x34 → Cyrillic; byte 0x61 → а
    expect(marc8ToUnicode(new Uint8Array([ESC, 0x28, 0x34, 0x61]))).toBe('а');
  });

  it('ESC ( S designates Greek USMARC to G0 (0x53 case)', () => {
    // final byte 0x53 → Greek; byte 0x61 → α
    expect(marc8ToUnicode(new Uint8Array([ESC, 0x28, 0x53, 0x61]))).toBe('α');
  });

  it('emits replacement for truncated EACC sequence', () => {
    // Designate EACC to G0 then supply only 2 bytes of what should be a 3-byte triple
    expect(marc8ToUnicode(new Uint8Array([ESC, 0x24, 0x31, 0x21, 0x21]))).toBe('�');
  });

  it('passes control bytes (< 0x20) through unchanged', () => {
    expect(marc8ToUnicode(new Uint8Array([0x09]))).toBe('\t');
    expect(marc8ToUnicode(new Uint8Array([0x0a]))).toBe('\n');
  });

  it('returns empty string for empty input', () => {
    expect(marc8ToUnicode(new Uint8Array([]))).toBe('');
  });
});

describe('unicodeToMarc8', () => {
  it('encodes ASCII characters unchanged', () => {
    const result = unicodeToMarc8('Hello');
    expect(Array.from(result)).toEqual([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
  });

  it('encodes extended Latin characters to MARC8 bytes', () => {
    const result = unicodeToMarc8('Łł');
    expect(result[0]).toBe(0xa1);
    expect(result[1]).toBe(0xb1);
  });

  it('encodes acute accent with reordering (diacritic precedes base in MARC8)', () => {
    // é in NFC; NFD gives e + combining acute
    const result = unicodeToMarc8('é');
    // MARC8 output should be: 0xE2 (acute) then 0x65 ('e')
    expect(result[0]).toBe(0xe2); // acute accent
    expect(result[1]).toBe(0x65); // 'e'
  });

  it('replaces unknown characters with ?', () => {
    const result = unicodeToMarc8('中'); // CJK not in basic MARC8
    expect(result[0]).toBe(0x3f); // '?'
  });

  it('round-trips ASCII through encode → decode', () => {
    const text = 'The quick brown fox';
    const encoded = unicodeToMarc8(text);
    const decoded = marc8ToUnicode(encoded);
    expect(decoded).toBe(text);
  });

  it('round-trips extended Latin through encode → decode', () => {
    const text = 'Łøæœ';
    const encoded = unicodeToMarc8(text);
    const decoded = marc8ToUnicode(encoded);
    expect(decoded).toBe(text);
  });

  it('round-trips accented characters with diacritics through encode → decode', () => {
    const text = 'éàü';
    const encoded = unicodeToMarc8(text);
    const decoded = marc8ToUnicode(encoded);
    expect(decoded.normalize('NFC')).toBe(text);
  });

  it('replaces orphan combining mark at start with ?', () => {
    // A combining mark with no preceding base character has no valid MARC-8 encoding
    const result = unicodeToMarc8('́');
    expect(Array.from(result)).toEqual([0x3f]);
  });

  it('silently drops unknown combining marks with no MARC-8 equivalent', () => {
    // U+0338 (combining long solidus) is in the combining range but not in ANSEL
    const result = unicodeToMarc8('a̸');
    expect(Array.from(result)).toEqual([0x61]); // just 'a', diacritic dropped
  });

  it('encodes supplementary character (> U+FFFF) as single ?', () => {
    // 𝄞 (U+1D11E) spans a surrogate pair in JS but has no MARC-8 equivalent
    const result = unicodeToMarc8('𝄞');
    expect(Array.from(result)).toEqual([0x3f]);
  });

  it('returns empty bytes for empty string', () => {
    expect(unicodeToMarc8('').length).toBe(0);
  });
});

describe('MARC8 parser integration', () => {
  it('parses MARC8-encoded records when leader byte 9 is space', () => {
    // Build a record with leader byte 9 = ' ' (MARC8) using UTF-8 serialization
    // then manually patch the encoding indicator in the buffer
    const record: MarcRecord = {
      leader: '00000nam  2200000   4500', // byte 9 is space (index 9 = ' ')
      fields: [
        { tag: '001', data: 'test001' },
        {
          tag: '245',
          indicator1: '1',
          indicator2: '0',
          subfields: [{ code: 'a', value: 'Hello World' }],
        },
      ],
    };

    // Serialize as MARC8
    const buffer = serializeMarcRecord(record, { encoding: 'marc8' });

    // Leader byte 9 should be ' ' (0x20)
    expect(buffer[9]).toBe(0x20);

    // Parse back
    const result = parseMarcRecord(buffer);
    expect(result.record).not.toBeNull();
    expect(result.record?.fields[0]).toMatchObject({ tag: '001', data: 'test001' });
  });

  it('round-trips a simple record through MARC8 serialize → parse', () => {
    const record: MarcRecord = {
      leader: '00000nam a2200000   4500',
      fields: [
        { tag: '001', data: 'ocm12345' },
        {
          tag: '245',
          indicator1: '1',
          indicator2: '0',
          subfields: [{ code: 'a', value: 'ASCII Title Only' }],
        },
      ],
    };

    const buffer = serializeMarcRecord(record, { encoding: 'marc8' });
    const result = parseMarcRecord(buffer);

    expect(result.warnings).toHaveLength(0);
    expect(result.record?.fields).toHaveLength(2);
    const df = result.record?.fields[1] as { subfields: { code: string; value: string }[] };
    expect(df.subfields[0]?.value).toBe('ASCII Title Only');
  });

  it('parses mixed escape-designated MARC8 field data', () => {
    const titleField = concatBytes(
      encodeAscii('10'),
      new Uint8Array([SUBFIELD_DELIMITER]),
      encodeAscii('aGreek '),
      new Uint8Array([ESC, 0x28, 0x51]),
      encodeAscii('ab'),
      new Uint8Array([ESC, 0x28, 0x42]),
      encodeAscii(' Hebrew '),
      new Uint8Array([ESC, 0x28, 0x32, 0x60, 0x61])
    );
    const buffer = buildMarc8Record([{ tag: '001', data: 'mixed001' }, { tag: '245', rawBytes: titleField }]);

    const result = parseMarcRecord(buffer);

    expect(result.warnings).toHaveLength(0);
    const field = result.record?.fields[1];
    expect(field && isDataField(field) ? field.subfields[0]?.value : undefined).toBe(
      'Greek αβ Hebrew אב'
    );
  });
});
