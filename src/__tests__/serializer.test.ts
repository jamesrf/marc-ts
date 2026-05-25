import { describe, it, expect } from 'vitest';
import { serializeMarcBinary } from '../serializer';
import { parseMarcBinary } from '../parser';
import type { MarcRecord } from '../types';

describe('serializeMarcBinary', () => {
  it('serializes a single record', () => {
    const record: MarcRecord = {
      leader: '00000nam  2200000   4500',
      fields: [{ tag: '001', data: 'x'.repeat(10) }],
    };

    const buffer = serializeMarcBinary([record]);
    expect(buffer).toBeInstanceOf(Uint8Array);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer[buffer.length - 1]).toBe(0x1d);
  });

  it('serializes multiple records end-to-end', () => {
    const r1: MarcRecord = {
      leader: '00000nam  2200000   4500',
      fields: [{ tag: '001', data: 'rec1' }],
    };
    const r2: MarcRecord = {
      leader: '00000nam  2200000   4500',
      fields: [{ tag: '001', data: 'rec2' }],
    };

    const buf1 = serializeMarcBinary([r1]);
    const buf2 = serializeMarcBinary([r2]);
    const combined = serializeMarcBinary([r1, r2]);

    expect(combined.length).toBe(buf1.length + buf2.length);
  });

  it('round-trips through serializeMarcBinary → parseMarcBinary', () => {
    const r1: MarcRecord = {
      leader: '00000nam  2200000   4500',
      fields: [
        { tag: '001', data: 'first' },
        {
          tag: '245',
          indicator1: '1',
          indicator2: '0',
          subfields: [{ code: 'a', value: 'First Title' }],
        },
      ],
    };
    const r2: MarcRecord = {
      leader: '00000nam  2200000   4500',
      fields: [
        { tag: '001', data: 'second' },
        {
          tag: '245',
          indicator1: '1',
          indicator2: '0',
          subfields: [{ code: 'a', value: 'Second Title' }],
        },
      ],
    };

    const buffer = serializeMarcBinary([r1, r2]);
    const records = parseMarcBinary(buffer);

    expect(records).toHaveLength(2);
    expect((records[0]!.fields[0] as { data: string }).data).toBe('first');
    expect((records[1]!.fields[0] as { data: string }).data).toBe('second');
  });

  it('returns empty Uint8Array for empty array input', () => {
    const buffer = serializeMarcBinary([]);
    expect(buffer).toBeInstanceOf(Uint8Array);
    expect(buffer.length).toBe(0);
  });

  it('throws when serialized record length exceeds the MARC leader limit', () => {
    const record: MarcRecord = {
      leader: '00000nam  2200000   4500',
      fields: [{ tag: '001', data: 'x'.repeat(100_000) }],
    };

    expect(() => serializeMarcBinary([record])).toThrow(
      'Record length 100041 exceeds maximum (99999)'
    );
  });

  describe('input validation', () => {
    const baseDataField = {
      tag: '245',
      indicator1: '1',
      indicator2: '0',
    } as const;

    it('throws on an empty subfield code', () => {
      const record: MarcRecord = {
        leader: '00000nam  2200000   4500',
        fields: [{ ...baseDataField, subfields: [{ code: '', value: 'x' }] }],
      };
      expect(() => serializeMarcBinary([record])).toThrow(/subfield code must be exactly 1 character/);
    });

    it('throws on a multi-character subfield code', () => {
      const record: MarcRecord = {
        leader: '00000nam  2200000   4500',
        fields: [{ ...baseDataField, subfields: [{ code: 'ab', value: 'x' }] }],
      };
      expect(() => serializeMarcBinary([record])).toThrow(/subfield code must be exactly 1 character/);
    });

    it('throws on an empty indicator', () => {
      const record: MarcRecord = {
        leader: '00000nam  2200000   4500',
        fields: [{ tag: '245', indicator1: '', indicator2: '0', subfields: [{ code: 'a', value: 'x' }] }],
      };
      expect(() => serializeMarcBinary([record])).toThrow(/indicator1 must be exactly 1 character/);
    });

    it('throws on a non-3-character tag', () => {
      const record: MarcRecord = {
        leader: '00000nam  2200000   4500',
        fields: [{ tag: '24', data: 'x' } as unknown as MarcRecord['fields'][number]],
      };
      expect(() => serializeMarcBinary([record])).toThrow(/tag must be exactly 3 characters/);
    });

    it('throws when indicator1 is a non-ASCII BMP character (zero-width space)', () => {
      const record: MarcRecord = {
        leader: '00000nam  2200000   4500',
        fields: [{ ...baseDataField, indicator1: '​', subfields: [] }],
      };
      expect(() => serializeMarcBinary([record])).toThrow(/indicator1 must be an ASCII printable character/);
    });

    it('throws when indicator2 is a non-ASCII BMP character (fullwidth digit)', () => {
      const record: MarcRecord = {
        leader: '00000nam  2200000   4500',
        fields: [{ ...baseDataField, indicator2: '１', subfields: [] }],
      };
      expect(() => serializeMarcBinary([record])).toThrow(/indicator2 must be an ASCII printable character/);
    });

    it('throws when a subfield code is a non-ASCII BMP character', () => {
      const record: MarcRecord = {
        leader: '00000nam  2200000   4500',
        fields: [{ ...baseDataField, subfields: [{ code: 'é', value: 'x' }] }],
      };
      expect(() => serializeMarcBinary([record])).toThrow(/subfield code must be an ASCII printable character/);
    });
  });
});
