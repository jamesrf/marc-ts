import { describe, it, expect } from 'vitest';
import { parseMarcRecord, parseMarcRecordStrict } from '../parser';
import { serializeMarcRecord } from '../serializer';
import type { MarcRecord, DataField } from '../types';

describe('parseMarcRecord', () => {
  it('should parse a simple MARC record', () => {
    // Create a simple MARC record manually
    const record: MarcRecord = {
      leader: '00000nam  2200000   4500',
      fields: [
        { tag: '001', data: 'test123' },
        {
          tag: '245',
          indicator1: '1',
          indicator2: '0',
          subfields: [
            { code: 'a', value: 'Test Title' },
            { code: 'c', value: 'Test Author' },
          ],
        },
      ],
    };

    // Serialize it
    const buffer = serializeMarcRecord(record);

    // Parse it back
    const result = parseMarcRecord(buffer);

    expect(result.record).toBeDefined();
    expect(result.warnings).toHaveLength(0);
    expect(result.record?.fields).toHaveLength(2);
  });

  it('should handle roundtrip serialization correctly', () => {
    const record: MarcRecord = {
      leader: '00000nam  2200000   4500',
      fields: [
        { tag: '001', data: 'ocm12345678' },
        { tag: '003', data: 'OCoLC' },
        {
          tag: '100',
          indicator1: '1',
          indicator2: ' ',
          subfields: [{ code: 'a', value: 'Salinger, J. D.' }],
        },
        {
          tag: '245',
          indicator1: '1',
          indicator2: '4',
          subfields: [
            { code: 'a', value: 'The Catcher in the Rye /' },
            { code: 'c', value: 'J.D. Salinger.' },
          ],
        },
        {
          tag: '260',
          indicator1: ' ',
          indicator2: ' ',
          subfields: [
            { code: 'a', value: 'Boston :' },
            { code: 'b', value: 'Little, Brown,' },
            { code: 'c', value: '1951.' },
          ],
        },
      ],
    };

    // Serialize to binary
    const buffer = serializeMarcRecord(record);
    expect(buffer).toBeInstanceOf(Uint8Array);
    expect(buffer.length).toBeGreaterThan(0);

    // Parse back from binary
    const result = parseMarcRecord(buffer);
    expect(result.record).toBeDefined();
    expect(result.warnings).toHaveLength(0);

    // Check fields
    const parsed = result.record!;
    expect(parsed.fields).toHaveLength(5);

    // Check control field
    expect(parsed.fields[0]).toEqual({ tag: '001', data: 'ocm12345678' });

    // Check data field
    const field245 = parsed.fields[3] as DataField;
    expect(field245.tag).toBe('245');
    expect(field245.indicator1).toBe('1');
    expect(field245.indicator2).toBe('4');
    expect(field245.subfields).toHaveLength(2);
    expect(field245.subfields[0]).toEqual({ code: 'a', value: 'The Catcher in the Rye /' });
  });

  it('should handle records with multiple subject fields', () => {
    const record: MarcRecord = {
      leader: '00000nam  2200000   4500',
      fields: [
        { tag: '001', data: 'test001' },
        {
          tag: '650',
          indicator1: ' ',
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
          tag: '650',
          indicator1: ' ',
          indicator2: '0',
          subfields: [{ code: 'a', value: 'Subject 3' }],
        },
      ],
    };

    const buffer = serializeMarcRecord(record);
    const result = parseMarcRecord(buffer);

    expect(result.record).toBeDefined();
    expect(result.record?.fields).toHaveLength(4);

    const subjectFields = result.record!.fields.filter((f) => f.tag === '650');
    expect(subjectFields).toHaveLength(3);
  });

  it('should handle truncated record in non-strict mode', () => {
    const buffer = new Uint8Array(10); // Too short to be valid
    const result = parseMarcRecord(buffer, { strict: false });

    expect(result.record).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]?.type).toBe('truncated_record');
  });

  it('should throw in strict mode for invalid records', () => {
    const buffer = new Uint8Array(10); // Too short to be valid

    expect(() => {
      parseMarcRecordStrict(buffer);
    }).toThrow();
  });

  it('should collect warnings for invalid records', () => {
    // Create a buffer with an invalid directory
    const buffer = new Uint8Array(30).fill(0x20); // Spaces

    const result = parseMarcRecord(buffer, { strict: false, maxWarnings: 10 });

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.record).toBeNull();
  });
});
