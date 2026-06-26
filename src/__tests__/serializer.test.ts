import { describe, it, expect, vi } from 'vitest';
import { serializeMarcBinary, serializeMarcBinaryWithWarnings } from '../serializer';
import { parseMarcBinary } from '../parser';
import type { MarcRecord } from '../types';
import * as marc8Module from '../marc8';

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
      expect(() => serializeMarcBinary([record])).toThrow(
        /subfield code must be exactly 1 character/
      );
    });

    it('throws on a multi-character subfield code', () => {
      const record: MarcRecord = {
        leader: '00000nam  2200000   4500',
        fields: [{ ...baseDataField, subfields: [{ code: 'ab', value: 'x' }] }],
      };
      expect(() => serializeMarcBinary([record])).toThrow(
        /subfield code must be exactly 1 character/
      );
    });

    it('throws on an empty indicator', () => {
      const record: MarcRecord = {
        leader: '00000nam  2200000   4500',
        fields: [
          { tag: '245', indicator1: '', indicator2: '0', subfields: [{ code: 'a', value: 'x' }] },
        ],
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
      expect(() => serializeMarcBinary([record])).toThrow(
        /indicator1 must be an ASCII printable character/
      );
    });

    it('throws when indicator2 is a non-ASCII BMP character (fullwidth digit)', () => {
      const record: MarcRecord = {
        leader: '00000nam  2200000   4500',
        fields: [{ ...baseDataField, indicator2: '１', subfields: [] }],
      };
      expect(() => serializeMarcBinary([record])).toThrow(
        /indicator2 must be an ASCII printable character/
      );
    });

    it('throws when a subfield code is a non-ASCII BMP character', () => {
      const record: MarcRecord = {
        leader: '00000nam  2200000   4500',
        fields: [{ ...baseDataField, subfields: [{ code: 'é', value: 'x' }] }],
      };
      expect(() => serializeMarcBinary([record])).toThrow(
        /subfield code must be an ASCII printable character/
      );
    });
  });
});

describe('serializeMarcBinaryWithWarnings', () => {
  it('returns bytes matching serializeMarcBinary for the same input', () => {
    const records: MarcRecord[] = [
      {
        leader: '00000nam  2200000   4500',
        fields: [
          { tag: '001', data: 'id1' },
          {
            tag: '245',
            indicator1: '1',
            indicator2: '0',
            subfields: [{ code: 'a', value: 'Title' }],
          },
        ],
      },
      {
        leader: '00000nam  2200000   4500',
        fields: [{ tag: '001', data: 'id2' }],
      },
    ];

    const plain = serializeMarcBinary(records);
    const batch = serializeMarcBinaryWithWarnings(records);

    expect(batch.bytes).toEqual(plain);
    expect(batch.results).toHaveLength(2);
  });

  it('returns no warnings for UTF-8 encoding', () => {
    const records: MarcRecord[] = [
      {
        leader: '00000nam  2200000   4500',
        fields: [
          {
            tag: '245',
            indicator1: '1',
            indicator2: '0',
            subfields: [{ code: 'a', value: 'Héllo Wörld' }],
          },
        ],
      },
    ];

    const batch = serializeMarcBinaryWithWarnings(records);
    expect(batch.results[0]!.warnings).toEqual([]);
  });

  it('captures MARC-8 lossy encoding warnings per record', () => {
    vi.spyOn(marc8Module, 'unicodeToMarc8WithStats').mockReturnValue({
      bytes: new Uint8Array([0x3f]),
      lossyCount: 2,
    });

    try {
      const records: MarcRecord[] = [
        {
          leader: '00000nam  2200000   4500',
          fields: [{ tag: '001', data: 'rec1' }],
        },
        {
          leader: '00000nam  2200000   4500',
          fields: [{ tag: '001', data: 'rec2' }],
        },
      ];

      const batch = serializeMarcBinaryWithWarnings(records, { encoding: 'marc8' });

      expect(batch.results).toHaveLength(2);
      expect(batch.results[0]!.warnings.length).toBeGreaterThan(0);
      expect(batch.results[0]!.warnings[0]!.type).toBe('encoding_error');
      expect(batch.results[0]!.warnings[0]!.message).toContain('MARC-8');
      expect(batch.results[1]!.warnings.length).toBeGreaterThan(0);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('respects maxWarnings in MARC-8 encoding', () => {
    let callCount = 0;
    vi.spyOn(marc8Module, 'unicodeToMarc8WithStats').mockImplementation(() => {
      callCount++;
      return { bytes: new Uint8Array([0x3f]), lossyCount: 1 };
    });

    try {
      const record: MarcRecord = {
        leader: '00000nam  2200000   4500',
        fields: [
          { tag: '001', data: 'f1' },
          {
            tag: '245',
            indicator1: '1',
            indicator2: '0',
            subfields: [
              { code: 'a', value: 'A' },
              { code: 'b', value: 'B' },
              { code: 'c', value: 'C' },
            ],
          },
        ],
      };

      const batch = serializeMarcBinaryWithWarnings([record], {
        encoding: 'marc8',
        maxWarnings: 2,
      });

      expect(batch.results[0]!.warnings.length).toBeLessThanOrEqual(2);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('returns empty results for empty input', () => {
    const batch = serializeMarcBinaryWithWarnings([]);
    expect(batch.bytes.length).toBe(0);
    expect(batch.results).toEqual([]);
  });
});
