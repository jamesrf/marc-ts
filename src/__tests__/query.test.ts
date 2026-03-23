import { describe, it, expect } from 'vitest';
import { getFieldsByPattern, getFirstFieldByPattern } from '../query';
import type { MarcRecord } from '../types';

describe('Wildcard Field Querying', () => {
  const testRecord: MarcRecord = {
    leader: '00000nam  2200000   4500',
    fields: [
      { tag: '001', data: 'test' },
      { tag: '003', data: 'OCoLC' },
      { tag: '008', data: '000000s2024    |||||||||||||||||||eng||' },
      {
        tag: '100',
        indicator1: '1',
        indicator2: ' ',
        subfields: [{ code: 'a', value: 'Author Name' }],
      },
      {
        tag: '245',
        indicator1: '1',
        indicator2: '0',
        subfields: [{ code: 'a', value: 'Title' }],
      },
      {
        tag: '246',
        indicator1: '3',
        indicator2: ' ',
        subfields: [{ code: 'a', value: 'Variant Title' }],
      },
      {
        tag: '600',
        indicator1: '1',
        indicator2: '0',
        subfields: [{ code: 'a', value: 'Subject 1' }],
      },
      {
        tag: '650',
        indicator1: ' ',
        indicator2: '0',
        subfields: [{ code: 'a', value: 'Subject 2' }],
      },
      {
        tag: '651',
        indicator1: ' ',
        indicator2: '0',
        subfields: [{ code: 'a', value: 'Geographic Subject' }],
      },
      {
        tag: '700',
        indicator1: '1',
        indicator2: ' ',
        subfields: [{ code: 'a', value: 'Added Entry 1' }],
      },
      {
        tag: '710',
        indicator1: '2',
        indicator2: ' ',
        subfields: [{ code: 'a', value: 'Added Entry 2' }],
      },
    ],
  };

  describe('getFieldsByPattern()', () => {
    it('should match all 6XX fields with pattern "6.."', () => {
      const fields = getFieldsByPattern(testRecord, '6..');
      expect(fields).toHaveLength(3);
      expect(fields.every((f) => f.tag.startsWith('6'))).toBe(true);
      expect(fields.map((f) => f.tag)).toEqual(['600', '650', '651']);
    });

    it('should match all 7XX fields with pattern "7XX"', () => {
      const fields = getFieldsByPattern(testRecord, '7XX');
      expect(fields).toHaveLength(2);
      expect(fields.map((f) => f.tag)).toEqual(['700', '710']);
    });

    it('should match all 7XX fields with pattern "7xx" (case-insensitive)', () => {
      const fields = getFieldsByPattern(testRecord, '7xx');
      expect(fields).toHaveLength(2);
    });

    it('should match specific range with pattern "24X"', () => {
      const fields = getFieldsByPattern(testRecord, '24X');
      expect(fields).toHaveLength(2);
      expect(fields.map((f) => f.tag)).toEqual(['245', '246']);
    });

    it('should match X00 fields with pattern "X00"', () => {
      const fields = getFieldsByPattern(testRecord, 'X00');
      expect(fields).toHaveLength(3); // Matches 100, 600, 700
      expect(fields.map((f) => f.tag)).toEqual(['100', '600', '700']);
    });

    it('should match 0XX fields with pattern "0.."', () => {
      const fields = getFieldsByPattern(testRecord, '0..');
      expect(fields).toHaveLength(3);
      expect(fields.every((f) => f.tag.startsWith('0'))).toBe(true);
    });

    it('should match exact tag "100"', () => {
      const fields = getFieldsByPattern(testRecord, '100');
      expect(fields).toHaveLength(1);
      expect(fields[0]?.tag).toBe('100');
    });

    it('should return empty array for non-matching pattern', () => {
      const fields = getFieldsByPattern(testRecord, '9..');
      expect(fields).toEqual([]);
    });

    it('should match all fields with pattern "..."', () => {
      const fields = getFieldsByPattern(testRecord, '...');
      expect(fields).toHaveLength(testRecord.fields.length);
    });
  });

  describe('getFirstFieldByPattern()', () => {
    it('should get first 6XX field', () => {
      const field = getFirstFieldByPattern(testRecord, '6..');
      expect(field).toBeDefined();
      expect(field?.tag).toBe('600');
    });

    it('should get first 7XX field', () => {
      const field = getFirstFieldByPattern(testRecord, '7XX');
      expect(field).toBeDefined();
      expect(field?.tag).toBe('700');
    });

    it('should return undefined for non-matching pattern', () => {
      const field = getFirstFieldByPattern(testRecord, '9..');
      expect(field).toBeUndefined();
    });

    it('should match exact tag', () => {
      const field = getFirstFieldByPattern(testRecord, '245');
      expect(field).toBeDefined();
      expect(field?.tag).toBe('245');
    });
  });
});
