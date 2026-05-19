import { describe, it, expect } from 'vitest';
import { marc8ToUnicode, unicodeToMarc8 } from '../marc8';
import { parseMarcRecord } from '../parser';
import { serializeMarcRecord } from '../serializer';
import type { MarcRecord } from '../types';

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
});
