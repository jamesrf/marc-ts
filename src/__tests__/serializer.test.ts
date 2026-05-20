import { describe, it, expect } from 'vitest';
import { serializeMarcRecord } from '../serializer';
import type { MarcRecord } from '../types';

describe('serializeMarcRecord', () => {
  it('throws when serialized record length exceeds the MARC leader limit', () => {
    const record: MarcRecord = {
      leader: '00000nam  2200000   4500',
      fields: [{ tag: '001', data: 'x'.repeat(100_000) }],
    };

    expect(() => serializeMarcRecord(record)).toThrow(
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
      expect(() => serializeMarcRecord(record)).toThrow(/subfield code must be exactly 1 character/);
    });

    it('throws on a multi-character subfield code', () => {
      const record: MarcRecord = {
        leader: '00000nam  2200000   4500',
        fields: [{ ...baseDataField, subfields: [{ code: 'ab', value: 'x' }] }],
      };
      expect(() => serializeMarcRecord(record)).toThrow(/subfield code must be exactly 1 character/);
    });

    it('throws on an empty indicator', () => {
      const record: MarcRecord = {
        leader: '00000nam  2200000   4500',
        fields: [
          {
            tag: '245',
            indicator1: '',
            indicator2: '0',
            subfields: [{ code: 'a', value: 'x' }],
          },
        ],
      };
      expect(() => serializeMarcRecord(record)).toThrow(/indicator1 must be exactly 1 character/);
    });

    it('throws on a non-3-character tag', () => {
      const record: MarcRecord = {
        leader: '00000nam  2200000   4500',
        fields: [{ tag: '24', data: 'x' } as unknown as MarcRecord['fields'][number]],
      };
      expect(() => serializeMarcRecord(record)).toThrow(/tag must be exactly 3 characters/);
    });

    it('throws when indicator1 is a non-ASCII BMP character (zero-width space)', () => {
      const record: MarcRecord = {
        leader: '00000nam  2200000   4500',
        fields: [{ ...baseDataField, indicator1: '​', subfields: [] }],
      };
      expect(() => serializeMarcRecord(record)).toThrow(/indicator1 must be an ASCII printable character/);
    });

    it('throws when indicator2 is a non-ASCII BMP character (fullwidth digit)', () => {
      const record: MarcRecord = {
        leader: '00000nam  2200000   4500',
        fields: [{ ...baseDataField, indicator2: '１', subfields: [] }],
      };
      expect(() => serializeMarcRecord(record)).toThrow(/indicator2 must be an ASCII printable character/);
    });

    it('throws when a subfield code is a non-ASCII BMP character', () => {
      const record: MarcRecord = {
        leader: '00000nam  2200000   4500',
        fields: [{ ...baseDataField, subfields: [{ code: 'é', value: 'x' }] }],
      };
      expect(() => serializeMarcRecord(record)).toThrow(/subfield code must be an ASCII printable character/);
    });
  });
});
