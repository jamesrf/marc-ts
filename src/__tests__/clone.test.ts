import { describe, it, expect } from 'vitest';
import { cloneRecord, recordsEqual, fieldsEqual } from '../clone';
import type { MarcRecord, DataField } from '../types';

describe('Clone and Equality', () => {
  const testRecord: MarcRecord = {
    leader: '00000nam  2200000   4500',
    fields: [
      { tag: '001', data: 'test123' },
      {
        tag: '245',
        indicator1: '1',
        indicator2: '0',
        subfields: [
          { code: 'a', value: 'Title' },
          { code: 'c', value: 'Statement' },
        ],
      },
      {
        tag: '650',
        indicator1: ' ',
        indicator2: '0',
        subfields: [{ code: 'a', value: 'Subject' }],
      },
    ],
  };

  describe('cloneRecord()', () => {
    it('should create a deep clone of record', () => {
      const clone = cloneRecord(testRecord);

      expect(clone).toEqual(testRecord);
      expect(clone).not.toBe(testRecord);
      expect(clone.fields).not.toBe(testRecord.fields);
    });

    it('should not share field references', () => {
      const clone = cloneRecord(testRecord);

      expect(clone.fields[0]).toEqual(testRecord.fields[0]);
      expect(clone.fields[0]).not.toBe(testRecord.fields[0]);
    });

    it('should not share subfield references', () => {
      const clone = cloneRecord(testRecord);

      const cloneField245 = clone.fields[1] as DataField;
      const originalField245 = testRecord.fields[1] as DataField;

      expect(cloneField245.subfields).toEqual(originalField245.subfields);
      expect(cloneField245.subfields).not.toBe(originalField245.subfields);
    });

    it('should allow independent modification of clone', () => {
      const clone = cloneRecord(testRecord);

      // Modify clone's leader
      clone.leader = '00000nam  2200000   9999';

      expect(clone.leader).not.toEqual(testRecord.leader);
      expect(testRecord.leader).toBe('00000nam  2200000   4500');
    });
  });

  describe('recordsEqual()', () => {
    it('should return true for identical records', () => {
      const clone = cloneRecord(testRecord);
      expect(recordsEqual(testRecord, clone)).toBe(true);
    });

    it('should return false for different leaders', () => {
      const modified: MarcRecord = {
        ...testRecord,
        leader: '00000nam  2200000   9999',
      };

      expect(recordsEqual(testRecord, modified)).toBe(false);
    });

    it('should return false for different number of fields', () => {
      const modified: MarcRecord = {
        ...testRecord,
        fields: testRecord.fields.slice(0, 2),
      };

      expect(recordsEqual(testRecord, modified)).toBe(false);
    });

    it('should return false for different field order by default', () => {
      const reordered: MarcRecord = {
        ...testRecord,
        fields: [testRecord.fields[1]!, testRecord.fields[0]!, testRecord.fields[2]!],
      };

      expect(recordsEqual(testRecord, reordered)).toBe(false);
    });

    it('should ignore field order when ignoreFieldOrder is true', () => {
      const reordered: MarcRecord = {
        ...testRecord,
        fields: [testRecord.fields[1]!, testRecord.fields[0]!, testRecord.fields[2]!],
      };

      expect(recordsEqual(testRecord, reordered, true)).toBe(true);
    });

    it('should return false for different field content', () => {
      const modified: MarcRecord = {
        ...testRecord,
        fields: [
          testRecord.fields[0]!,
          {
            tag: '245',
            indicator1: '1',
            indicator2: '0',
            subfields: [{ code: 'a', value: 'Different Title' }],
          },
          testRecord.fields[2]!,
        ],
      };

      expect(recordsEqual(testRecord, modified)).toBe(false);
    });
  });

  describe('fieldsEqual()', () => {
    it('should return true for identical control fields', () => {
      const field1 = { tag: '001', data: 'test123' };
      const field2 = { tag: '001', data: 'test123' };

      expect(fieldsEqual(field1, field2)).toBe(true);
    });

    it('should return false for control fields with different data', () => {
      const field1 = { tag: '001', data: 'test123' };
      const field2 = { tag: '001', data: 'test456' };

      expect(fieldsEqual(field1, field2)).toBe(false);
    });

    it('should return false for control fields with different tags', () => {
      const field1 = { tag: '001', data: 'test123' };
      const field2 = { tag: '003', data: 'test123' };

      expect(fieldsEqual(field1, field2)).toBe(false);
    });

    it('should return true for identical data fields', () => {
      const field1: DataField = {
        tag: '245',
        indicator1: '1',
        indicator2: '0',
        subfields: [
          { code: 'a', value: 'Title' },
          { code: 'c', value: 'Statement' },
        ],
      };
      const field2: DataField = {
        tag: '245',
        indicator1: '1',
        indicator2: '0',
        subfields: [
          { code: 'a', value: 'Title' },
          { code: 'c', value: 'Statement' },
        ],
      };

      expect(fieldsEqual(field1, field2)).toBe(true);
    });

    it('should return false for data fields with different indicators', () => {
      const field1: DataField = {
        tag: '245',
        indicator1: '1',
        indicator2: '0',
        subfields: [{ code: 'a', value: 'Title' }],
      };
      const field2: DataField = {
        tag: '245',
        indicator1: '0',
        indicator2: '0',
        subfields: [{ code: 'a', value: 'Title' }],
      };

      expect(fieldsEqual(field1, field2)).toBe(false);
    });

    it('should return false for data fields with different subfields', () => {
      const field1: DataField = {
        tag: '245',
        indicator1: '1',
        indicator2: '0',
        subfields: [{ code: 'a', value: 'Title 1' }],
      };
      const field2: DataField = {
        tag: '245',
        indicator1: '1',
        indicator2: '0',
        subfields: [{ code: 'a', value: 'Title 2' }],
      };

      expect(fieldsEqual(field1, field2)).toBe(false);
    });

    it('should return false for data fields with different number of subfields', () => {
      const field1: DataField = {
        tag: '245',
        indicator1: '1',
        indicator2: '0',
        subfields: [
          { code: 'a', value: 'Title' },
          { code: 'c', value: 'Statement' },
        ],
      };
      const field2: DataField = {
        tag: '245',
        indicator1: '1',
        indicator2: '0',
        subfields: [{ code: 'a', value: 'Title' }],
      };

      expect(fieldsEqual(field1, field2)).toBe(false);
    });

    it('should return false when comparing control field to data field', () => {
      const controlField = { tag: '001', data: 'test123' };
      const dataField: DataField = {
        tag: '245',
        indicator1: '1',
        indicator2: '0',
        subfields: [{ code: 'a', value: 'Title' }],
      };

      expect(fieldsEqual(controlField, dataField)).toBe(false);
    });
  });
});
