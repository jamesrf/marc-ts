import { describe, it, expect } from 'vitest';
import { parseMarcRecord, parseMarcRecordStrict } from '../parser';
import { serializeMarcRecord } from '../serializer';
import type { MarcRecord, DataField } from '../types';

describe('parseMarcRecord', () => {
  function encodeAscii(text: string): Uint8Array {
    return new TextEncoder().encode(text);
  }

  function buildMalformedRecord(
    leader: string,
    directory: string,
    fields: Uint8Array = new Uint8Array()
  ): Uint8Array {
    const leaderBytes = encodeAscii(leader);
    const directoryBytes = encodeAscii(directory);
    const buffer = new Uint8Array(leaderBytes.length + directoryBytes.length + 1 + fields.length + 1);
    let offset = 0;

    buffer.set(leaderBytes, offset);
    offset += leaderBytes.length;
    buffer.set(directoryBytes, offset);
    offset += directoryBytes.length;
    buffer[offset++] = 0x1e;
    buffer.set(fields, offset);
    offset += fields.length;
    buffer[offset] = 0x1d;

    return buffer;
  }

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

  it('should warn for invalid indicator and subfield length leader positions', () => {
    const buffer = serializeMarcRecord({
      leader: '00000nam  2200000   4500',
      fields: [{ tag: '001', data: 'test123' }],
    });

    buffer[10] = '1'.charCodeAt(0);
    buffer[11] = '1'.charCodeAt(0);

    const result = parseMarcRecord(buffer);

    expect(result.record).toBeDefined();
    expect(result.warnings).toEqual([
      expect.objectContaining({
        type: 'invalid_leader',
        message: "Leader position 10 (indicator count) is '1', expected '2'",
      }),
      expect.objectContaining({
        type: 'invalid_leader',
        message: "Leader position 11 (subfield code length) is '1', expected '2'",
      }),
    ]);
  });

  it('should keep parsing in strict mode for non-fatal leader compatibility warnings', () => {
    const buffer = serializeMarcRecord({
      leader: '00000nam  2200000   4500',
      fields: [{ tag: '001', data: 'test123' }],
    });
    buffer[10] = '1'.charCodeAt(0);

    const result = parseMarcRecord(buffer, { strict: true });

    expect(result.record).toBeDefined();
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: 'invalid_leader',
        message: "Leader position 10 (indicator count) is '1', expected '2'",
      })
    );
  });

  it('should warn and continue when leader record length is not numeric', () => {
    const buffer = serializeMarcRecord({
      leader: '00000nam  2200000   4500',
      fields: [{ tag: '001', data: 'test123' }],
    });
    buffer.set(encodeAscii('abcde'), 0);

    const result = parseMarcRecord(buffer);

    expect(result.record).toBeDefined();
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: 'invalid_leader',
        message: 'Invalid record length in leader: abcde',
      })
    );
  });

  it('should throw in strict mode when leader record length is not numeric', () => {
    const buffer = serializeMarcRecord({
      leader: '00000nam  2200000   4500',
      fields: [{ tag: '001', data: 'test123' }],
    });
    buffer.set(encodeAscii('abcde'), 0);

    expect(() => parseMarcRecord(buffer, { strict: true })).toThrow(
      'Invalid record length in leader: abcde'
    );
  });

  it('should return null when leader base address is not numeric', () => {
    const buffer = serializeMarcRecord({
      leader: '00000nam  2200000   4500',
      fields: [{ tag: '001', data: 'test123' }],
    });
    buffer.set(encodeAscii('abcde'), 12);

    const result = parseMarcRecord(buffer);

    expect(result.record).toBeNull();
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: 'invalid_leader',
        message: 'Invalid base address in leader: abcde',
      })
    );
  });

  it('should throw in strict mode when leader base address is not numeric', () => {
    const buffer = serializeMarcRecord({
      leader: '00000nam  2200000   4500',
      fields: [{ tag: '001', data: 'test123' }],
    });
    buffer.set(encodeAscii('abcde'), 12);

    expect(() => parseMarcRecord(buffer, { strict: true })).toThrow(
      'Invalid base address in leader: abcde'
    );
  });

  it('should throw in strict mode when the directory terminator is missing', () => {
    const buffer = new Uint8Array(30).fill(0x20);
    buffer.set(encodeAscii('00030nam  2200029   4500'), 0);

    expect(() => parseMarcRecord(buffer, { strict: true })).toThrow(
      'Directory terminator not found'
    );
  });

  it('should throw in strict mode when no valid directory entries are found', () => {
    const leader = '00038nam  2200037   4500';
    const buffer = buildMalformedRecord(leader, '001bad!00000');

    expect(() => parseMarcRecord(buffer, { strict: true })).toThrow(
      'Invalid directory entry for tag 001: length=bad!, position=00000'
    );
  });

  it('should ignore a partial trailing directory entry', () => {
    const leader = '00043nam  2200040   4500';
    const buffer = buildMalformedRecord(leader, '001000300000245', encodeAscii('ok'));

    const result = parseMarcRecord(buffer);

    expect(result.record?.fields).toEqual([{ tag: '001', data: 'ok' }]);
    expect(result.warnings).toHaveLength(0);
  });

  it('should skip invalid directory entries and keep valid ones', () => {
    const leader = '00052nam  2200049   4500';
    const fieldData = encodeAscii('ok');
    const buffer = buildMalformedRecord(leader, '001bad!00000003000300000', fieldData);

    const result = parseMarcRecord(buffer);

    expect(result.record?.fields).toEqual([{ tag: '003', data: 'ok' }]);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: 'invalid_directory',
        message: 'Invalid directory entry for tag 001: length=bad!, position=00000',
      })
    );
  });

  it('should stop collecting directory warnings at maxWarnings', () => {
    const leader = '00061nam  2200061   4500';
    const buffer = buildMalformedRecord(leader, '001bad!00000002bad!00000003bad!00000');

    const result = parseMarcRecord(buffer, { maxWarnings: 2 });

    expect(result.record).toBeNull();
    expect(result.warnings).toHaveLength(3);
    expect(result.warnings[result.warnings.length - 1]).toEqual(
      expect.objectContaining({
        type: 'invalid_directory',
        message: 'No directory entries found',
      })
    );
  });

  it('should warn when a directory entry points outside the buffer', () => {
    const leader = '00037nam  2200037   4500';
    const buffer = buildMalformedRecord(leader, '245000500999');

    const result = parseMarcRecord(buffer);

    expect(result.record?.fields).toEqual([]);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: 'invalid_field',
        tag: '245',
      })
    );
  });

  it('should throw in strict mode when a directory entry points outside the buffer', () => {
    const leader = '00037nam  2200037   4500';
    const buffer = buildMalformedRecord(leader, '245000500999');

    expect(() => parseMarcRecord(buffer, { strict: true })).toThrow(
      'Field 245 out of bounds'
    );
  });

  it('should throw in strict mode when a data field is too short for indicators', () => {
    const leader = '00039nam  2200037   4500';
    const buffer = buildMalformedRecord(leader, '245000200000', encodeAscii('x'));

    expect(() => parseMarcRecord(buffer, { strict: true })).toThrow(
      'Data field 245 too short for indicators: 1 bytes'
    );
  });

  it('should warn when a data field is missing a subfield delimiter', () => {
    const leader = '00041nam  2200037   4500';
    const buffer = buildMalformedRecord(leader, '245000400000', encodeAscii('10x'));

    const result = parseMarcRecord(buffer);

    expect(result.record?.fields).toEqual([
      {
        tag: '245',
        indicator1: '1',
        indicator2: '0',
        subfields: [],
      },
    ]);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: 'invalid_field',
        message: 'Expected subfield delimiter in field 245 at position 0',
        tag: '245',
      })
    );
  });

  it('should throw in strict mode when a data field is missing a subfield delimiter', () => {
    const leader = '00041nam  2200037   4500';
    const buffer = buildMalformedRecord(leader, '245000400000', encodeAscii('10x'));

    expect(() => parseMarcRecord(buffer, { strict: true })).toThrow(
      'Expected subfield delimiter in field 245 at position 0'
    );
  });

  it('should stop parsing fields when maxWarnings has been reached', () => {
    const leader = '00049nam  2200049   4500';
    const buffer = buildMalformedRecord(leader, '245000500999001000300000', encodeAscii('ok'));

    const result = parseMarcRecord(buffer, { maxWarnings: 1 });

    expect(result.record?.fields).toEqual([]);
    expect(result.warnings).toHaveLength(1);
  });

  it('should stop parsing subfields when maxWarnings has been reached', () => {
    const leader = '00046nam  2200037   4500';
    const buffer = buildMalformedRecord(
      leader,
      '245000900000',
      new Uint8Array([49, 48, 120, 0x1f, 97, 111, 107, 0x1f])
    );

    const result = parseMarcRecord(buffer, { maxWarnings: 1 });

    expect(result.record?.fields).toEqual([
      {
        tag: '245',
        indicator1: '1',
        indicator2: '0',
        subfields: [],
      },
    ]);
    expect(result.warnings).toHaveLength(1);
  });

  it('should handle a trailing subfield delimiter without creating a subfield', () => {
    const leader = '00040nam  2200037   4500';
    const buffer = buildMalformedRecord(leader, '245000300000', new Uint8Array([49, 48, 0x1f]));

    const result = parseMarcRecord(buffer);

    expect(result.record?.fields).toEqual([
      {
        tag: '245',
        indicator1: '1',
        indicator2: '0',
        subfields: [],
      },
    ]);
    expect(result.warnings).toHaveLength(0);
  });
});
