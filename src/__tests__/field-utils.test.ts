import { describe, it, expect } from 'vitest';
import { getField, getFields, getSubfield, getSubfields, getAllSubfields } from '../field-utils';
import type { MarcRecord, DataField } from '../types';
import { isDataField } from '../types';

describe('Field Utilities', () => {
  const testRecord: MarcRecord = {
    leader: '00000nam  2200000   4500',
    fields: [
      { tag: '001', data: 'test123' },
      {
        tag: '245',
        indicator1: '1',
        indicator2: '0',
        subfields: [
          { code: 'a', value: 'Main Title' },
          { code: 'b', value: 'Subtitle' },
          { code: 'c', value: 'Statement of Responsibility' },
        ],
      },
      {
        tag: '650',
        indicator1: ' ',
        indicator2: '0',
        subfields: [
          { code: 'a', value: 'Subject 1' },
          { code: 'x', value: 'Subdivision 1' },
          { code: 'x', value: 'Subdivision 2' },
        ],
      },
      {
        tag: '650',
        indicator1: ' ',
        indicator2: '0',
        subfields: [{ code: 'a', value: 'Subject 2' }],
      },
    ],
  };

  describe('getField()', () => {
    it('should get the first field with specified tag', () => {
      const field = getField(testRecord, '245');
      expect(field).toBeDefined();
      expect(field?.tag).toBe('245');
    });

    it('should return undefined for non-existent tag', () => {
      const field = getField(testRecord, '999');
      expect(field).toBeUndefined();
    });

    it('should return first field when multiple exist', () => {
      const field = getField(testRecord, '650');
      expect(field).toBeDefined();
      expect(field?.tag).toBe('650');
      if (field && isDataField(field)) {
        const firstSubject = getSubfield(field, 'a');
        expect(firstSubject).toBe('Subject 1');
      }
    });
  });

  describe('getFields()', () => {
    it('should get all fields with specified tag', () => {
      const fields = getFields(testRecord, '650');
      expect(fields).toHaveLength(2);
      expect(fields.every((f) => f.tag === '650')).toBe(true);
    });

    it('should return empty array for non-existent tag', () => {
      const fields = getFields(testRecord, '999');
      expect(fields).toEqual([]);
    });

    it('should return single field in array', () => {
      const fields = getFields(testRecord, '245');
      expect(fields).toHaveLength(1);
      expect(fields[0]?.tag).toBe('245');
    });
  });

  describe('getSubfield()', () => {
    it('should get first subfield with specified code', () => {
      const field = getField(testRecord, '245');
      expect(field).toBeDefined();

      if (field && isDataField(field)) {
        const subfield = getSubfield(field, 'a');
        expect(subfield).toBe('Main Title');
      }
    });

    it('should return undefined for non-existent subfield code', () => {
      const field = getField(testRecord, '245');
      if (field && isDataField(field)) {
        const subfield = getSubfield(field, 'z');
        expect(subfield).toBeUndefined();
      }
    });

    it('should return first occurrence for repeatable subfields', () => {
      const field = getField(testRecord, '650');
      if (field && isDataField(field)) {
        const subfield = getSubfield(field, 'x');
        expect(subfield).toBe('Subdivision 1');
      }
    });
  });

  describe('getSubfields()', () => {
    it('should get all subfields with specified code', () => {
      const field = getField(testRecord, '650');
      if (field && isDataField(field)) {
        const subfields = getSubfields(field, 'x');
        expect(subfields).toEqual(['Subdivision 1', 'Subdivision 2']);
      }
    });

    it('should return empty array for non-existent subfield code', () => {
      const field = getField(testRecord, '245');
      if (field && isDataField(field)) {
        const subfields = getSubfields(field, 'z');
        expect(subfields).toEqual([]);
      }
    });

    it('should return single subfield in array', () => {
      const field = getField(testRecord, '245');
      if (field && isDataField(field)) {
        const subfields = getSubfields(field, 'a');
        expect(subfields).toEqual(['Main Title']);
      }
    });
  });

  describe('getAllSubfields()', () => {
    it('should get all subfields as {code, value} pairs', () => {
      const field = getField(testRecord, '245');
      if (field && isDataField(field)) {
        const subfields = getAllSubfields(field);
        expect(subfields).toEqual([
          { code: 'a', value: 'Main Title' },
          { code: 'b', value: 'Subtitle' },
          { code: 'c', value: 'Statement of Responsibility' },
        ]);
      }
    });

    it('should handle repeatable subfields', () => {
      const field = getField(testRecord, '650');
      if (field && isDataField(field)) {
        const subfields = getAllSubfields(field);
        expect(subfields).toHaveLength(3);
        expect(subfields[0]).toEqual({ code: 'a', value: 'Subject 1' });
        expect(subfields[1]).toEqual({ code: 'x', value: 'Subdivision 1' });
        expect(subfields[2]).toEqual({ code: 'x', value: 'Subdivision 2' });
      }
    });
  });
});
