import { describe, it, expect } from 'vitest';
import {
  appendField,
  insertFieldBefore,
  insertFieldAfter,
  insertGroupedField,
  removeFields,
  removeField,
  addSubfield,
  removeSubfield,
  replaceSubfield,
} from '../field-ops';
import type { MarcRecord, DataField } from '../types';

describe('Field Operations', () => {
  const testRecord: MarcRecord = {
    leader: '00000nam  2200000   4500',
    fields: [
      { tag: '001', data: 'test123' },
      {
        tag: '100',
        indicator1: '1',
        indicator2: ' ',
        subfields: [{ code: 'a', value: 'Author' }],
      },
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
        subfields: [{ code: 'a', value: 'Subject 1' }],
      },
      {
        tag: '700',
        indicator1: '1',
        indicator2: ' ',
        subfields: [{ code: 'a', value: 'Added Entry' }],
      },
    ],
  };

  describe('appendField()', () => {
    it('should append field to end of record', () => {
      const newField: DataField = {
        tag: '710',
        indicator1: '2',
        indicator2: ' ',
        subfields: [{ code: 'a', value: 'Corporate Added Entry' }],
      };

      const result = appendField(testRecord, newField);

      expect(result.fields).toHaveLength(6);
      expect(result.fields[5]).toEqual(newField);
      expect(testRecord.fields).toHaveLength(5); // Original unchanged
    });

    it('should not mutate original record', () => {
      const newField: DataField = {
        tag: '999',
        indicator1: ' ',
        indicator2: ' ',
        subfields: [{ code: 'a', value: 'Test' }],
      };

      const originalLength = testRecord.fields.length;
      appendField(testRecord, newField);

      expect(testRecord.fields).toHaveLength(originalLength);
    });
  });

  describe('insertFieldBefore()', () => {
    it('should insert field before specified tag', () => {
      const newField: DataField = {
        tag: '240',
        indicator1: '1',
        indicator2: '0',
        subfields: [{ code: 'a', value: 'Uniform Title' }],
      };

      const result = insertFieldBefore(testRecord, '245', newField);

      expect(result.fields).toHaveLength(6);
      const index245 = result.fields.findIndex((f) => f.tag === '245');
      expect(result.fields[index245 - 1]?.tag).toBe('240');
    });

    it('should append if tag not found', () => {
      const newField: DataField = {
        tag: '856',
        indicator1: '4',
        indicator2: '0',
        subfields: [{ code: 'u', value: 'http://example.com' }],
      };

      const result = insertFieldBefore(testRecord, '999', newField);

      expect(result.fields).toHaveLength(6);
      expect(result.fields[5]).toEqual(newField);
    });
  });

  describe('insertFieldAfter()', () => {
    it('should insert field after specified tag', () => {
      const newField: DataField = {
        tag: '246',
        indicator1: '3',
        indicator2: ' ',
        subfields: [{ code: 'a', value: 'Variant Title' }],
      };

      const result = insertFieldAfter(testRecord, '245', newField);

      expect(result.fields).toHaveLength(6);
      const index245 = result.fields.findIndex((f) => f.tag === '245');
      expect(result.fields[index245 + 1]?.tag).toBe('246');
    });

    it('should append if tag not found', () => {
      const newField: DataField = {
        tag: '900',
        indicator1: ' ',
        indicator2: ' ',
        subfields: [{ code: 'a', value: 'Local Field' }],
      };

      const result = insertFieldAfter(testRecord, '999', newField);

      expect(result.fields).toHaveLength(6);
      expect(result.fields[5]).toEqual(newField);
    });
  });

  describe('insertGroupedField()', () => {
    it('should insert field in MARC block order', () => {
      const newField: DataField = {
        tag: '260',
        indicator1: ' ',
        indicator2: ' ',
        subfields: [
          { code: 'a', value: 'New York :' },
          { code: 'b', value: 'Publisher,' },
          { code: 'c', value: '2024.' },
        ],
      };

      const result = insertGroupedField(testRecord, newField);

      expect(result.fields).toHaveLength(6);

      // Should be after 245 (2XX block) but before 650 (6XX block)
      const index260 = result.fields.findIndex((f) => f.tag === '260');
      const index245 = result.fields.findIndex((f) => f.tag === '245');
      const index650 = result.fields.findIndex((f) => f.tag === '650');

      expect(index260).toBeGreaterThan(index245);
      expect(index260).toBeLessThan(index650);
    });

    it('should append 9XX fields to end', () => {
      const newField: DataField = {
        tag: '999',
        indicator1: ' ',
        indicator2: ' ',
        subfields: [{ code: 'a', value: 'Local Field' }],
      };

      const result = insertGroupedField(testRecord, newField);

      expect(result.fields[result.fields.length - 1]?.tag).toBe('999');
    });

    it('should insert 5XX before 6XX', () => {
      const newField: DataField = {
        tag: '500',
        indicator1: ' ',
        indicator2: ' ',
        subfields: [{ code: 'a', value: 'Note' }],
      };

      const result = insertGroupedField(testRecord, newField);
      const index500 = result.fields.findIndex((f) => f.tag === '500');
      const index650 = result.fields.findIndex((f) => f.tag === '650');

      expect(index500).toBeLessThan(index650);
    });

    it('inserts a 010 field before an existing 100 field', () => {
      // Previously both 010 and 100 mapped to "block 1" so 010 was appended
      // after 100 — a misorder consumers would notice on round-trip.
      const rec: MarcRecord = {
        leader: '00000nam a2200000 a 4500',
        fields: [
          { tag: '001', data: 'x' },
          {
            tag: '100',
            indicator1: '1',
            indicator2: ' ',
            subfields: [{ code: 'a', value: 'Author' }],
          },
        ],
      };
      const newField: DataField = {
        tag: '010',
        indicator1: ' ',
        indicator2: ' ',
        subfields: [{ code: 'a', value: '   12345 ' }],
      };

      const result = insertGroupedField(rec, newField);
      const tags = result.fields.map((f) => f.tag);
      expect(tags).toEqual(['001', '010', '100']);
    });

    it('inserts a 650 between 600 and 700', () => {
      const rec: MarcRecord = {
        leader: '00000nam a2200000 a 4500',
        fields: [
          {
            tag: '600',
            indicator1: ' ',
            indicator2: '0',
            subfields: [{ code: 'a', value: 'Person' }],
          },
          {
            tag: '700',
            indicator1: '1',
            indicator2: ' ',
            subfields: [{ code: 'a', value: 'Other' }],
          },
        ],
      };
      const newField: DataField = {
        tag: '650',
        indicator1: ' ',
        indicator2: '0',
        subfields: [{ code: 'a', value: 'Subject' }],
      };

      const result = insertGroupedField(rec, newField);
      expect(result.fields.map((f) => f.tag)).toEqual(['600', '650', '700']);
    });
  });

  describe('removeFields()', () => {
    it('should remove all fields with specified tag', () => {
      const result = removeFields(testRecord, '650');

      expect(result.fields).toHaveLength(4);
      expect(result.fields.every((f) => f.tag !== '650')).toBe(true);
      expect(testRecord.fields).toHaveLength(5); // Original unchanged
    });

    it('should return unchanged record if tag not found', () => {
      const result = removeFields(testRecord, '999');

      expect(result.fields).toHaveLength(5);
      expect(result.fields).not.toBe(testRecord.fields); // New array
    });
  });

  describe('removeField()', () => {
    it('should remove specific field instance', () => {
      const fieldToRemove = testRecord.fields[3]!; // The 650 field
      const result = removeField(testRecord, fieldToRemove);

      expect(result.fields).toHaveLength(4);
      expect(result.fields.includes(fieldToRemove)).toBe(false);
    });
  });

  describe('addSubfield()', () => {
    it('should add subfield to field', () => {
      const field245 = testRecord.fields[2] as DataField;
      const result = addSubfield(field245, 'b', 'Subtitle');

      expect(result.subfields).toHaveLength(3);
      expect(result.subfields[2]).toEqual({ code: 'b', value: 'Subtitle' });
      expect(field245.subfields).toHaveLength(2); // Original unchanged
    });

    it('should not mutate original field', () => {
      const field245 = testRecord.fields[2] as DataField;
      const originalLength = field245.subfields.length;

      addSubfield(field245, 'b', 'Subtitle');

      expect(field245.subfields).toHaveLength(originalLength);
    });
  });

  describe('removeSubfield()', () => {
    it('should remove all subfields with specified code', () => {
      const field245 = testRecord.fields[2] as DataField;
      const result = removeSubfield(field245, 'c');

      expect(result.subfields).toHaveLength(1);
      expect(result.subfields[0]?.code).toBe('a');
      expect(field245.subfields).toHaveLength(2); // Original unchanged
    });

    it('should return unchanged field if code not found', () => {
      const field245 = testRecord.fields[2] as DataField;
      const result = removeSubfield(field245, 'z');

      expect(result.subfields).toHaveLength(2);
      expect(result.subfields).not.toBe(field245.subfields); // New array
    });
  });

  describe('replaceSubfield()', () => {
    it('should replace first subfield with specified code', () => {
      const field245 = testRecord.fields[2] as DataField;
      const result = replaceSubfield(field245, 'a', 'New Title');

      expect(result.subfields[0]?.value).toBe('New Title');
      expect(field245.subfields[0]?.value).toBe('Title'); // Original unchanged
    });

    it('should add subfield if code not found', () => {
      const field245 = testRecord.fields[2] as DataField;
      const result = replaceSubfield(field245, 'b', 'Subtitle');

      expect(result.subfields).toHaveLength(3);
      expect(result.subfields[2]).toEqual({ code: 'b', value: 'Subtitle' });
    });
  });
});
