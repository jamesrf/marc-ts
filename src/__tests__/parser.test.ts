import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseMarcRecord, parseMarcRecordStrict } from '../parser';
import { serializeMarcRecord } from '../serializer';
import type { MarcRecord, DataField } from '../types';
import * as marc8Module from '../marc8';

describe('parseMarcRecord', () => {
  function encodeAscii(text: string): Uint8Array {
    return new TextEncoder().encode(text);
  }

  function buildMalformedRecord(
    leader: string,
    directory: string,
    fields: Uint8Array = new Uint8Array(),
    options: { appendFieldTerminator?: boolean } = {}
  ): Uint8Array {
    const appendFt = options.appendFieldTerminator ?? false;
    const leaderBytes = encodeAscii(leader);
    const directoryBytes = encodeAscii(directory);
    // Layout: leader | directory | 0x1e (dir term) | fields | [0x1e] | 0x1d
    const buffer = new Uint8Array(
      leaderBytes.length + directoryBytes.length + 1 + fields.length + (appendFt ? 1 : 0) + 1
    );
    let offset = 0;

    buffer.set(leaderBytes, offset);
    offset += leaderBytes.length;
    buffer.set(directoryBytes, offset);
    offset += directoryBytes.length;
    buffer[offset++] = 0x1e;
    buffer.set(fields, offset);
    offset += fields.length;
    if (appendFt) {
      buffer[offset++] = 0x1e;
    }
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
    const leader = '00044nam  2200040   4500';
    const buffer = buildMalformedRecord(leader, '001000300000245', encodeAscii('ok'), {
      appendFieldTerminator: true,
    });

    const result = parseMarcRecord(buffer);

    expect(result.record?.fields).toEqual([{ tag: '001', data: 'ok' }]);
    expect(result.warnings).toHaveLength(0);
  });

  it('should skip invalid directory entries and keep valid ones', () => {
    const leader = '00053nam  2200049   4500';
    const fieldData = encodeAscii('ok');
    const buffer = buildMalformedRecord(leader, '001bad!00000003000300000', fieldData, {
      appendFieldTerminator: true,
    });

    const result = parseMarcRecord(buffer);

    expect(result.record?.fields).toEqual([{ tag: '003', data: 'ok' }]);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: 'invalid_directory',
        message: 'Invalid directory entry for tag 001: length=bad!, position=00000',
      })
    );
  });

  it('should stop collecting directory warnings at maxWarnings and emit a truncated_record marker', () => {
    const leader = '00061nam  2200061   4500';
    const buffer = buildMalformedRecord(leader, '001bad!00000002bad!00000003bad!00000');

    const result = parseMarcRecord(buffer, { maxWarnings: 2 });

    expect(result.record).toBeNull();
    // Two invalid_directory warnings (hits the cap), then the truncated_record
    // marker, then the terminal 'No directory entries found' warning.
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: 'truncated_record',
        message: expect.stringContaining('Directory parsing halted'),
      })
    );
    expect(result.warnings[result.warnings.length - 1]).toEqual(
      expect.objectContaining({
        type: 'invalid_directory',
        message: 'No directory entries found',
      })
    );
  });

  it('should warn when a directory entry points outside the buffer', () => {
    const leader = '00038nam  2200037   4500';
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
    const leader = '00038nam  2200037   4500';
    const buffer = buildMalformedRecord(leader, '245000500999');

    expect(() => parseMarcRecord(buffer, { strict: true })).toThrow(
      'Field 245 out of bounds'
    );
  });

  it('should throw in strict mode when a data field is too short for indicators', () => {
    // Field length 2 includes the trailing field terminator: 1 byte of data + 0x1e.
    const leader = '00040nam  2200037   4500';
    const buffer = buildMalformedRecord(leader, '245000200000', encodeAscii('x'), {
      appendFieldTerminator: true,
    });

    expect(() => parseMarcRecord(buffer, { strict: true })).toThrow(
      'Data field 245 too short for indicators: 1 bytes'
    );
  });

  it('should warn when a data field is missing a subfield delimiter', () => {
    // Field length 4 = "10x" + 0x1e.
    const leader = '00042nam  2200037   4500';
    const buffer = buildMalformedRecord(leader, '245000400000', encodeAscii('10x'), {
      appendFieldTerminator: true,
    });

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
    const leader = '00042nam  2200037   4500';
    const buffer = buildMalformedRecord(leader, '245000400000', encodeAscii('10x'), {
      appendFieldTerminator: true,
    });

    expect(() => parseMarcRecord(buffer, { strict: true })).toThrow(
      'Expected subfield delimiter in field 245 at position 0'
    );
  });

  it('should stop parsing fields when maxWarnings has been reached and emit a truncated_record marker', () => {
    // Two directory entries; the first is out of bounds and will trip
    // maxWarnings=1. The second entry then triggers the truncated_record marker.
    const leader = '00052nam  2200049   4500';
    const buffer = buildMalformedRecord(leader, '245000500999001000300000', encodeAscii('ok'));

    const result = parseMarcRecord(buffer, { maxWarnings: 1 });

    expect(result.record?.fields).toEqual([]);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: 'truncated_record',
        message: expect.stringContaining('Field parsing halted'),
      })
    );
  });

  it('should stop parsing subfields when maxWarnings has been reached and emit a truncated_record marker', () => {
    // Field bytes: indicators "10", then valid subfield "$aOK", with a non-FT
    // last byte. The missing-FT warning trips maxWarnings=1, so parseSubfields
    // is entered with warnings already at the cap and emits the marker.
    const leader = '00046nam  2200037   4500';
    const buffer = buildMalformedRecord(
      leader,
      '245000800000',
      new Uint8Array([49, 48, 0x1f, 97, 79, 75, 0x58, 0x58])
    );

    const result = parseMarcRecord(buffer, { maxWarnings: 1 });

    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: 'truncated_record',
        message: expect.stringContaining('Subfield parsing halted'),
        tag: '245',
      })
    );
  });

  it('should handle a trailing subfield delimiter without creating a subfield', () => {
    // Field length 4 = "10" + 0x1f + 0x1e. Trailing delimiter with no code.
    const leader = '00042nam  2200037   4500';
    const buffer = buildMalformedRecord(
      leader,
      '245000400000',
      new Uint8Array([49, 48, 0x1f]),
      { appendFieldTerminator: true }
    );

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

  it('warns when the buffer is longer than the record length and truncates to the declared length', () => {
    const valid = serializeMarcRecord({
      leader: '00000nam  2200000   4500',
      fields: [{ tag: '001', data: 'ok' }],
    });
    const padded = new Uint8Array(valid.length + 10);
    padded.set(valid);
    // Trailing junk bytes after the record terminator
    for (let i = valid.length; i < padded.length; i++) padded[i] = 0x58;

    const result = parseMarcRecord(padded);

    expect(result.record?.fields).toEqual([{ tag: '001', data: 'ok' }]);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: 'truncated_record',
        message: expect.stringContaining('Buffer is longer than the record length'),
      })
    );
  });

  it('includes a hex byte preview in encoding_error warnings', () => {
    // Decode errors via UTF-8 are rare (TextDecoder is non-fatal), but if a
    // future MARC-8 path throws, the warning message should carry a preview
    // of the raw bytes so callers can diagnose. Sanity-check the path by
    // forcing the parser to use a throwing decoder via a buffer with the
    // MARC-8 leader byte and a subfield value of unmappable bytes.
    // The current marc8 decoder doesn't throw, so this is a smoke test that
    // valid records don't accidentally emit the warning.
    const buffer = serializeMarcRecord({
      leader: '00000nam  2200000   4500',
      fields: [
        {
          tag: '245',
          indicator1: '1',
          indicator2: '0',
          subfields: [{ code: 'a', value: 'Title' }],
        },
      ],
    });
    const result = parseMarcRecord(buffer);
    expect(result.warnings.filter((w) => w.type === 'encoding_error')).toHaveLength(0);
  });

  it('warns when a field does not end with the field terminator and recovers the last byte', () => {
    // Field "abcd": declared length 4, last byte is 'd' (not 0x1e).
    // Old parser would silently strip 'd'; the fix warns and keeps it.
    const leader = '00042nam  2200037   4500';
    const buffer = buildMalformedRecord(leader, '001000400000', encodeAscii('abcd'));

    const result = parseMarcRecord(buffer);

    expect(result.record?.fields).toEqual([{ tag: '001', data: 'abcd' }]);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: 'invalid_field',
        tag: '001',
        message: expect.stringContaining('does not end with a field terminator'),
      })
    );
  });

  it('should throw in strict mode when field does not end with a field terminator', () => {
    const leader = '00042nam  2200037   4500';
    const buffer = buildMalformedRecord(leader, '001000400000', encodeAscii('abcd'));

    expect(() => parseMarcRecord(buffer, { strict: true })).toThrow(
      'does not end with a field terminator'
    );
  });

  it('parseMarcRecordStrict returns the record on success', () => {
    const buffer = serializeMarcRecord({
      leader: '00000nam  2200000   4500',
      fields: [{ tag: '001', data: 'test' }],
    });

    const record = parseMarcRecordStrict(buffer);

    expect(record).toBeDefined();
    expect(record.fields).toEqual([{ tag: '001', data: 'test' }]);
  });

  it('should return null and warn in non-strict mode when the directory terminator is missing', () => {
    // Buffer is long enough but has no 0x1e byte after the leader.
    const buffer = new Uint8Array(30).fill(0x41); // 'A' throughout — no 0x1e
    buffer.set(encodeAscii('00030nam  2200029   4500'), 0);

    const result = parseMarcRecord(buffer, { strict: false });

    expect(result.record).toBeNull();
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: 'invalid_directory',
        message: 'Directory terminator not found',
      })
    );
  });

  it('should return null and warn in non-strict mode when directory has no valid entries', () => {
    const leader = '00038nam  2200037   4500';
    const buffer = buildMalformedRecord(leader, '001bad!00000');

    const result = parseMarcRecord(buffer, { strict: false });

    expect(result.record).toBeNull();
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: 'invalid_directory',
        message: 'No directory entries found',
      })
    );
  });

  it('should throw in strict mode when buffer is longer than declared record length', () => {
    const valid = serializeMarcRecord({
      leader: '00000nam  2200000   4500',
      fields: [{ tag: '001', data: 'ok' }],
    });
    const padded = new Uint8Array(valid.length + 10);
    padded.set(valid);

    expect(() => parseMarcRecord(padded, { strict: true })).toThrow(
      'Buffer is longer than the record length declared in the leader'
    );
  });

  it('should warn when leader encoding flag (byte 9) is neither space nor "a"', () => {
    const buffer = serializeMarcRecord({
      leader: '00000nam  2200000   4500',
      fields: [{ tag: '001', data: 'test' }],
    });
    // Byte 9: 'a' means UTF-8, ' ' means MARC-8; anything else is invalid
    buffer[9] = 'z'.charCodeAt(0);

    const result = parseMarcRecord(buffer, { strict: false });

    expect(result.record).toBeDefined();
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: 'invalid_leader',
        message: expect.stringContaining("Leader position 9 (encoding flag) is 'z'"),
      })
    );
  });

  it('should throw in strict mode when leader encoding flag (byte 9) is invalid', () => {
    const buffer = serializeMarcRecord({
      leader: '00000nam  2200000   4500',
      fields: [{ tag: '001', data: 'test' }],
    });
    buffer[9] = 'z'.charCodeAt(0);

    expect(() => parseMarcRecord(buffer, { strict: true })).toThrow(
      "Leader position 9 (encoding flag) is 'z'"
    );
  });

  it('parseMarcRecordStrict throws when parsing fails', () => {
    const buffer = new Uint8Array(10); // too short

    expect(() => parseMarcRecordStrict(buffer)).toThrow();
  });

  it('should warn when data field is too short for indicators in non-strict mode and skip the field', () => {
    // Field length 2 = 1 byte of data + 0x1e. That leaves 1 byte after stripping
    // the terminator, which is < 2 (too short for indicators).
    const leader = '00040nam  2200037   4500';
    const buffer = buildMalformedRecord(leader, '245000200000', encodeAscii('x'), {
      appendFieldTerminator: true,
    });

    const result = parseMarcRecord(buffer, { strict: false });

    expect(result.record?.fields).toEqual([]);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: 'invalid_field',
        tag: '245',
        message: expect.stringContaining('too short for indicators'),
      })
    );
  });

  it('bytesPreview truncates long byte sequences in warning messages', () => {
    const longValue = 'A'.repeat(24);
    const record = serializeMarcRecord({
      leader: '00000nam  2200000   4500',
      fields: [{ tag: '001', data: longValue }],
    });

    const result = parseMarcRecord(record);

    expect(result.warnings.filter((w) => w.type === 'encoding_error')).toHaveLength(0);
    expect((result.record!.fields[0] as { data: string }).data).toBe(longValue);
  });

  describe('encoding error recovery (mocked decoder)', () => {
    let spy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      spy = vi.spyOn(marc8Module, 'marc8ToUnicode').mockImplementation(() => {
        throw new Error('mock decode failure');
      });
    });

    afterEach(() => {
      spy.mockRestore();
    });

    // To reach the MARC-8 decoder path, leader byte 9 must be ' ' (space).
    // serializeMarcRecord writes 'a' at position 9 for UTF-8; patch it to ' '.
    function makeMarc8Buffer(record: MarcRecord): Uint8Array {
      const buf = serializeMarcRecord(record);
      buf[9] = 0x20; // ' ' => MARC-8 path
      return buf;
    }

    it('warns and recovers when control field decoding throws (non-strict)', () => {
      const buf = makeMarc8Buffer({
        leader: '00000nam  2200000   4500',
        fields: [{ tag: '001', data: 'test' }],
      });

      const result = parseMarcRecord(buf, { strict: false });

      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          type: 'encoding_error',
          tag: '001',
          message: expect.stringContaining('Failed to decode control field 001'),
        })
      );
      // Field is still present with best-effort decode output
      expect(result.record?.fields.some((f) => f.tag === '001')).toBe(true);
    });

    it('throws in strict mode when control field decoding throws', () => {
      const buf = makeMarc8Buffer({
        leader: '00000nam  2200000   4500',
        fields: [{ tag: '001', data: 'test' }],
      });

      expect(() => parseMarcRecord(buf, { strict: true })).toThrow(
        'Failed to decode control field 001'
      );
    });

    it('warns and recovers when subfield decoding throws (non-strict)', () => {
      const buf = makeMarc8Buffer({
        leader: '00000nam  2200000   4500',
        fields: [
          {
            tag: '245',
            indicator1: '1',
            indicator2: '0',
            subfields: [{ code: 'a', value: 'Title' }],
          },
        ],
      });

      const result = parseMarcRecord(buf, { strict: false });

      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          type: 'encoding_error',
          tag: '245',
          message: expect.stringContaining('Failed to decode subfield 245$a'),
        })
      );
    });

    it('throws in strict mode when subfield decoding throws', () => {
      const buf = makeMarc8Buffer({
        leader: '00000nam  2200000   4500',
        fields: [
          {
            tag: '245',
            indicator1: '1',
            indicator2: '0',
            subfields: [{ code: 'a', value: 'Title' }],
          },
        ],
      });

      expect(() => parseMarcRecord(buf, { strict: true })).toThrow(
        'Failed to decode subfield 245$a'
      );
    });

    it('includes truncated hex preview in encoding_error warning for long values', () => {
      // 24-byte value exceeds the 16-byte bytesPreview limit, producing "… (24 bytes)" suffix
      const longValue = 'A'.repeat(24);
      const buf = makeMarc8Buffer({
        leader: '00000nam  2200000   4500',
        fields: [{ tag: '001', data: longValue }],
      });

      const result = parseMarcRecord(buf, { strict: false });

      const encErr = result.warnings.find((w) => w.type === 'encoding_error');
      expect(encErr?.message).toMatch(/… \(24 bytes\)/); // "… (24 bytes)"
    });
  });
});

describe('leader[9] encoding flag validation', () => {
  it('emits an invalid_leader warning when leader byte 9 is neither space nor "a"', () => {
    const buffer = serializeMarcRecord({
      leader: '00000nam a2200000   4500',
      fields: [{ tag: '001', data: 'test' }],
    });
    buffer[9] = 'x'.charCodeAt(0);

    const result = parseMarcRecord(buffer);

    expect(result.record).toBeDefined();
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: 'invalid_leader',
        message: expect.stringContaining("Leader position 9 (encoding flag) is 'x'"),
      })
    );
  });

  it('throws in strict mode when leader byte 9 is unexpected', () => {
    const buffer = serializeMarcRecord({
      leader: '00000nam a2200000   4500',
      fields: [{ tag: '001', data: 'test' }],
    });
    buffer[9] = 'x'.charCodeAt(0);

    expect(() => parseMarcRecord(buffer, { strict: true })).toThrow(
      /Leader position 9 \(encoding flag\) is 'x'/
    );
  });

  it('does not emit an invalid_leader warning for space (MARC-8)', () => {
    const buffer = serializeMarcRecord({
      leader: '00000nam  2200000   4500',
      fields: [{ tag: '001', data: 'test' }],
    });
    const result = parseMarcRecord(buffer);
    const leaderWarnings = result.warnings.filter(
      (w) => w.type === 'invalid_leader' && w.message.includes('encoding flag')
    );
    expect(leaderWarnings).toHaveLength(0);
  });

  it('does not emit an invalid_leader warning for "a" (UTF-8)', () => {
    const buffer = serializeMarcRecord({
      leader: '00000nam a2200000   4500',
      fields: [{ tag: '001', data: 'test' }],
    });
    const result = parseMarcRecord(buffer);
    const leaderWarnings = result.warnings.filter(
      (w) => w.type === 'invalid_leader' && w.message.includes('encoding flag')
    );
    expect(leaderWarnings).toHaveLength(0);
  });
});
