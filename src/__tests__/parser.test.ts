import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseMarcBinary, parseMarcBinaryWithWarnings } from '../parser';
import { serializeMarcBinary } from '../serializer';
import type { MarcRecord, DataField } from '../types';
import * as marc8Module from '../marc8';

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

describe('parseMarcBinary', () => {
  it('parses a single record', () => {
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

    const buffer = serializeMarcBinary([record]);
    const records = parseMarcBinary(buffer);

    expect(records).toHaveLength(1);
    expect(records[0]?.fields).toHaveLength(2);
  });

  it('parses two concatenated records', () => {
    const r1: MarcRecord = {
      leader: '00000nam  2200000   4500',
      fields: [{ tag: '001', data: 'rec1' }],
    };
    const r2: MarcRecord = {
      leader: '00000nam  2200000   4500',
      fields: [{ tag: '001', data: 'rec2' }],
    };

    const buffer = serializeMarcBinary([r1, r2]);
    const records = parseMarcBinary(buffer);

    expect(records).toHaveLength(2);
    expect((records[0]!.fields[0] as { data: string }).data).toBe('rec1');
    expect((records[1]!.fields[0] as { data: string }).data).toBe('rec2');
  });

  it('returns empty array for empty buffer', () => {
    expect(parseMarcBinary(new Uint8Array(0))).toEqual([]);
  });

  it('skips bad records and keeps good ones', () => {
    const good: MarcRecord = {
      leader: '00000nam  2200000   4500',
      fields: [{ tag: '001', data: 'ok' }],
    };
    const goodBuffer = serializeMarcBinary([good]);

    // Build a bad slice: too short to be valid (< 25 bytes)
    const badSlice = new Uint8Array(12);
    badSlice[badSlice.length - 1] = 0x1d; // give it a terminator

    const combined = new Uint8Array(badSlice.length + goodBuffer.length);
    combined.set(badSlice, 0);
    combined.set(goodBuffer, badSlice.length);

    const records = parseMarcBinary(combined);
    expect(records).toHaveLength(1);
    expect((records[0]!.fields[0] as { data: string }).data).toBe('ok');
  });

  it('round-trips through serializeMarcBinary and parseMarcBinary', () => {
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
      ],
    };

    const buffer = serializeMarcBinary([record]);
    const records = parseMarcBinary(buffer);

    expect(records).toHaveLength(1);
    const parsed = records[0]!;
    expect(parsed.fields).toHaveLength(4);
    const field245 = parsed.fields[3] as DataField;
    expect(field245.tag).toBe('245');
    expect(field245.indicator1).toBe('1');
    expect(field245.indicator2).toBe('4');
    expect(field245.subfields[0]).toEqual({ code: 'a', value: 'The Catcher in the Rye /' });
  });

  it('handles records with multiple subject fields', () => {
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

    const buffer = serializeMarcBinary([record]);
    const records = parseMarcBinary(buffer);

    expect(records[0]?.fields).toHaveLength(4);
    expect(records[0]!.fields.filter((f) => f.tag === '650')).toHaveLength(3);
  });

  it('handles truncated record in non-strict mode (silently skips)', () => {
    const too_short = new Uint8Array(11); // 10 data bytes + 0x1d
    too_short[10] = 0x1d;
    const records = parseMarcBinary(too_short, { strict: false });
    expect(records).toHaveLength(0);
  });

  it('warns when a directory entry points outside the buffer', () => {
    // parseMarcBinary is lenient — invalid records are skipped, not thrown
    const buffer = buildMalformedRecord('00038nam  2200037   4500', '245000500999');
    const records = parseMarcBinary(buffer);
    // Record is recovered with empty fields
    expect(records[0]?.fields).toEqual([]);
  });

  it('warns for invalid indicator positions but still returns record', () => {
    const record: MarcRecord = {
      leader: '00000nam  2200000   4500',
      fields: [{ tag: '001', data: 'test123' }],
    };
    const buffer = serializeMarcBinary([record]);
    buffer[10] = '1'.charCodeAt(0);
    buffer[11] = '1'.charCodeAt(0);

    const records = parseMarcBinary(buffer);
    expect(records).toHaveLength(1);
  });

  it('ignores a partial trailing directory entry', () => {
    const leader = '00044nam  2200040   4500';
    const buffer = buildMalformedRecord(leader, '001000300000245', encodeAscii('ok'), {
      appendFieldTerminator: true,
    });

    const records = parseMarcBinary(buffer);
    expect(records[0]?.fields).toEqual([{ tag: '001', data: 'ok' }]);
  });

  it('warns when buffer is longer than the record length and truncates', () => {
    const good: MarcRecord = {
      leader: '00000nam  2200000   4500',
      fields: [{ tag: '001', data: 'ok' }],
    };
    const valid = serializeMarcBinary([good]);
    const padded = new Uint8Array(valid.length + 10);
    padded.set(valid);
    for (let i = valid.length; i < padded.length; i++) padded[i] = 0x58;

    // parseMarcBinary splits on 0x1d — padding after the terminator is a new
    // (empty / too-short) slice which is silently skipped
    const records = parseMarcBinary(padded);
    expect(records[0]?.fields).toEqual([{ tag: '001', data: 'ok' }]);
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

    function makeMarc8Buffer(record: MarcRecord): Uint8Array {
      const buf = serializeMarcBinary([record]);
      buf[9] = 0x20; // ' ' => MARC-8 path
      return buf;
    }

    it('recovers with best-effort decode when control field decoding throws (non-strict)', () => {
      const buf = makeMarc8Buffer({
        leader: '00000nam  2200000   4500',
        fields: [{ tag: '001', data: 'test' }],
      });

      const records = parseMarcBinary(buf, { strict: false });
      expect(records[0]?.fields.some((f) => f.tag === '001')).toBe(true);
    });

    it('skips record in strict mode when decoding throws', () => {
      const buf = makeMarc8Buffer({
        leader: '00000nam  2200000   4500',
        fields: [{ tag: '001', data: 'test' }],
      });

      expect(() => parseMarcBinary(buf, { strict: true })).toThrow(
        'Failed to decode control field 001'
      );
    });

    it('recovers with best-effort decode when subfield decoding throws (non-strict)', () => {
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

      const records = parseMarcBinary(buf, { strict: false });
      expect(records[0]?.fields.some((f) => f.tag === '245')).toBe(true);
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

      expect(() => parseMarcBinary(buf, { strict: true })).toThrow(
        'Failed to decode subfield 245$a'
      );
    });

    it('halts subfield parsing when maxWarnings is reached mid-subfield-loop', () => {
      // With mocked decoder throwing on every subfield, each subfield decode
      // pushes a warning and continues. On the second subfield's loop-top check,
      // warnings.length >= maxWarnings fires (lines 452-461).
      const buf = makeMarc8Buffer({
        leader: '00000nam  2200000   4500',
        fields: [
          {
            tag: '245',
            indicator1: '1',
            indicator2: '0',
            subfields: [
              { code: 'a', value: 'First' },
              { code: 'b', value: 'Second' },
            ],
          },
        ],
      });

      const records = parseMarcBinary(buf, { strict: false, maxWarnings: 1 });
      // Should return the record with partial subfields (only 'a' recovered)
      expect(records[0]?.fields.some((f) => f.tag === '245')).toBe(true);
    });
  });

  describe('strict mode error paths', () => {
    it('throws in strict mode when record is too short', () => {
      const tooShort = new Uint8Array(10);
      tooShort[9] = 0x1d;
      expect(() => parseMarcBinary(tooShort, { strict: true })).toThrow('Record too short');
    });

    it('throws in strict mode when base address is invalid', () => {
      // Build a buffer where the leader has non-numeric base address (positions 12-16)
      // and the declared record length matches the actual buffer size to avoid
      // triggering the "buffer longer than record" path first.
      // leader: positions 0-4 = length, 12-16 = base address
      // Layout: leader(24) | dir(12) | 0x1e | field_data | 0x1e | 0x1d
      const dirStr = '001000500000';
      const fieldData = encodeAscii('ok\x1e');
      const totalLen = 24 + dirStr.length + 1 + fieldData.length + 1;
      // leader: length=totalLen, base address=XXXXX (non-numeric)
      const lenStr = totalLen.toString().padStart(5, '0');
      const leaderStr = `${lenStr}nam  22XXXXX   4500`;
      const buffer = buildMalformedRecord(leaderStr, dirStr, fieldData);
      expect(() => parseMarcBinary(buffer, { strict: true })).toThrow('Invalid base address');
    });

    it('throws in strict mode when directory terminator is missing', () => {
      // Build a buffer with no 0x1e in it after the leader
      const leaderStr = '00038nam  2200000   4500';
      const leaderBytes = encodeAscii(leaderStr);
      // Fill the rest with non-terminator bytes, end with record terminator
      const buf = new Uint8Array(38);
      buf.set(leaderBytes, 0);
      for (let i = leaderBytes.length; i < buf.length - 1; i++) buf[i] = 0x41; // 'A'
      buf[buf.length - 1] = 0x1d;
      expect(() => parseMarcBinary(buf, { strict: true })).toThrow(
        'Directory terminator not found'
      );
    });

    it('throws in strict mode when no directory entries found', () => {
      // Directory is present but empty (directory end immediately follows leader)
      const leaderStr = '00026nam  2200000   4500';
      const leaderBytes = encodeAscii(leaderStr);
      // leader (24) | 0x1e (dir term) | 0x1d (record term)
      const buf = new Uint8Array(leaderBytes.length + 2);
      buf.set(leaderBytes, 0);
      buf[leaderBytes.length] = 0x1e;
      buf[leaderBytes.length + 1] = 0x1d;
      expect(() => parseMarcBinary(buf, { strict: true })).toThrow('No directory entries found');
    });

    it('throws in strict mode when leader encoding flag is unknown', () => {
      const record: MarcRecord = {
        leader: '00000nam  2200000   4500',
        fields: [{ tag: '001', data: 'test' }],
      };
      const buf = serializeMarcBinary([record]);
      buf[9] = 0x62; // 'b' — invalid encoding flag
      expect(() => parseMarcBinary(buf, { strict: true })).toThrow('Leader position 9');
    });

    it('throws in strict mode when buffer is longer than declared record length', () => {
      const record: MarcRecord = {
        leader: '00000nam  2200000   4500',
        fields: [{ tag: '001', data: 'ok' }],
      };
      // serializeMarcBinary ends with 0x1d; build a single-record buffer then
      // append extra bytes WITHOUT another 0x1d so it's one slice to parseMarcRecord
      const valid = serializeMarcBinary([record]);
      // Remove the trailing 0x1d so parseMarcBinary treats the whole thing as one unterminated slice
      const noTerm = valid.slice(0, valid.length - 1);
      const padded = new Uint8Array(noTerm.length + 5);
      padded.set(noTerm, 0);
      for (let i = noTerm.length; i < padded.length; i++) padded[i] = 0x58; // 'X'
      expect(() => parseMarcBinary(padded, { strict: true })).toThrow(
        'Buffer is longer than the record length declared'
      );
    });

    it('throws in strict mode when directory entry has invalid length/position', () => {
      // Directory entry with non-numeric length field
      const buffer = buildMalformedRecord('00038nam  2200037   4500', '245XXXX00000');
      expect(() => parseMarcBinary(buffer, { strict: true })).toThrow('Invalid directory entry');
    });

    it('throws in strict mode when field is out of bounds', () => {
      const buffer = buildMalformedRecord('00038nam  2200037   4500', '245000500999');
      expect(() => parseMarcBinary(buffer, { strict: true })).toThrow('out of bounds');
    });

    it('throws in strict mode when field does not end with field terminator', () => {
      // Build a valid record then corrupt the field terminator byte.
      // serializeMarcBinary([{001: 'test'}]) = 43 bytes:
      //   [0..23]  leader, [24..35] dir, [36] dir-term 0x1e,
      //   [37..40] 'test', [41] field-term 0x1e, [42] record-term 0x1d
      const record: MarcRecord = {
        leader: '00000nam  2200000   4500',
        fields: [{ tag: '001', data: 'test' }],
      };
      const buf = serializeMarcBinary([record]);
      // Skip past the directory terminator (first 0x1e) and corrupt the field terminator.
      let foundFirst = false;
      for (let i = 30; i < buf.length - 1; i++) {
        if (buf[i] === 0x1e) {
          if (!foundFirst) {
            foundFirst = true; // skip directory terminator
            continue;
          }
          buf[i] = 0x41; // 'A' — corrupt the field terminator
          break;
        }
      }
      expect(() => parseMarcBinary(buf, { strict: true })).toThrow(
        'does not end with a field terminator'
      );
    });

    it('throws in strict mode when data field is too short for indicators', () => {
      // Build a directory entry for data field 245 with fieldLength=2:
      // parser computes end = start+1, checks buffer[end] === 0x1e (ok),
      // then fieldBytes = buffer.slice(start, end) = 1 byte < 2 needed for indicators.
      // Layout: leader(24) | dir(12) | 0x1e(1) | 0x41(1) 0x1e(1) | 0x1d(1) = 40 bytes
      const dirStr = '245000200000';
      // fieldData: 1 content byte + field terminator (the terminator is in the data blob,
      // not appended by buildMalformedRecord since appendFieldTerminator is not set)
      const fieldData = new Uint8Array([0x41, 0x1e]); // indicator placeholder + 0x1e
      const totalLen = 24 + dirStr.length + 1 + fieldData.length + 1;
      const lenStr = totalLen.toString().padStart(5, '0');
      const baseStr = (24 + dirStr.length + 1).toString().padStart(5, '0');
      const leaderStr = `${lenStr}nam  22${baseStr}   4500`;
      const buffer = buildMalformedRecord(leaderStr, dirStr, fieldData);
      expect(() => parseMarcBinary(buffer, { strict: true })).toThrow('too short for indicators');
    });

    it('throws in strict mode when subfield delimiter is missing', () => {
      // Build a data field where after indicators the first byte is not 0x1f
      const record: MarcRecord = {
        leader: '00000nam  2200000   4500',
        fields: [
          {
            tag: '245',
            indicator1: '1',
            indicator2: '0',
            subfields: [{ code: 'a', value: 'Title' }],
          },
        ],
      };
      const buf = serializeMarcBinary([record]);
      // Find the subfield delimiter (0x1f) and corrupt it
      for (let i = 30; i < buf.length - 1; i++) {
        if (buf[i] === 0x1f) {
          buf[i] = 0x41; // 'A'
          break;
        }
      }
      expect(() => parseMarcBinary(buf, { strict: true })).toThrow('Expected subfield delimiter');
    });
  });

  describe('maxWarnings limit', () => {
    it('halts directory parsing when maxWarnings is reached', () => {
      // Build a record with many directory entries that each have invalid length/position
      // so each one adds a warning and maxWarnings=1 is hit quickly
      const invalidEntries = 'AAAAAAAAAAAABBBBBBBBBBBBCCCCCCCCCCCC'; // 3 bad entries × 12 bytes
      const leader = '00073nam  2200073   4500';
      const buffer = buildMalformedRecord(leader, invalidEntries);
      // With maxWarnings=1, parsing stops after first warning
      const records = parseMarcBinary(buffer, { maxWarnings: 1 });
      // Record may be null or have no fields — just ensure it doesn't throw
      expect(Array.isArray(records)).toBe(true);
    });

    it('halts field parsing when maxWarnings is reached', () => {
      // Build a record with 3 valid directory entries pointing out of bounds
      // so each one adds a warning; maxWarnings=1 stops after first
      const buffer = buildMalformedRecord(
        '00073nam  2200073   4500',
        '245000500999650000500998700000500997'
      );
      const records = parseMarcBinary(buffer, { maxWarnings: 1 });
      expect(Array.isArray(records)).toBe(true);
    });

    it('halts subfield parsing when maxWarnings is reached mid-field', () => {
      // Use a record with many subfields and maxWarnings=0 so the limit is hit
      // the moment parseSubfields is entered (warnings.length=0, maxWarnings=0
      // means 0 >= 0 is true immediately).
      const record: MarcRecord = {
        leader: '00000nam  2200000   4500',
        fields: [
          {
            tag: '245',
            indicator1: '1',
            indicator2: '0',
            subfields: [
              { code: 'a', value: 'A' },
              { code: 'b', value: 'B' },
            ],
          },
        ],
      };
      const buf = serializeMarcBinary([record]);
      const records = parseMarcBinary(buf, { maxWarnings: 0 });
      expect(Array.isArray(records)).toBe(true);
    });

    it('warns (non-strict) when subfield delimiter is missing mid-field', () => {
      // Corrupt the second subfield delimiter to trigger the "expected delimiter" path
      // in non-strict mode (lines 473-474).
      const record: MarcRecord = {
        leader: '00000nam  2200000   4500',
        fields: [
          {
            tag: '245',
            indicator1: '1',
            indicator2: '0',
            subfields: [
              { code: 'a', value: 'A' },
              { code: 'b', value: 'B' },
            ],
          },
        ],
      };
      const buf = serializeMarcBinary([record]);
      let delimCount = 0;
      for (let i = 30; i < buf.length - 1; i++) {
        if (buf[i] === 0x1f) {
          delimCount++;
          if (delimCount === 2) {
            buf[i] = 0x41; // corrupt second delimiter
            break;
          }
        }
      }
      // Use a high maxWarnings so the delimiter-missing warning is actually pushed
      const records = parseMarcBinary(buf, { strict: false, maxWarnings: 100 });
      expect(Array.isArray(records)).toBe(true);
    });
  });

  it('handles a final record with no trailing record terminator', () => {
    const record: MarcRecord = {
      leader: '00000nam  2200000   4500',
      fields: [{ tag: '001', data: 'noterminator' }],
    };
    const buf = serializeMarcBinary([record]);
    // Remove the trailing 0x1d so parseMarcBinary hits the "no trailing terminator" path
    const noTerm = buf.slice(0, buf.length - 1);
    const records = parseMarcBinary(noTerm);
    expect(records[0]?.fields[0]).toMatchObject({ tag: '001', data: 'noterminator' });
  });

  it('skips invalid directory entry in non-strict mode and returns null record', () => {
    // Directory entry with NaN field length hits the non-strict path (lines 290-291);
    // all entries are invalid so directoryEntries.length === 0 → record: null
    const buffer = buildMalformedRecord('00038nam  2200037   4500', '245XXXX00000');
    const records = parseMarcBinary(buffer, { strict: false });
    expect(records).toHaveLength(0);
  });

  it('returns null record in non-strict mode when base address is non-numeric', () => {
    const dirStr = '001000500000';
    const fieldData = encodeAscii('ok\x1e');
    const totalLen = 24 + dirStr.length + 1 + fieldData.length + 1;
    const lenStr = totalLen.toString().padStart(5, '0');
    const leaderStr = `${lenStr}nam  22XXXXX   4500`;
    const buffer = buildMalformedRecord(leaderStr, dirStr, fieldData);
    const records = parseMarcBinary(buffer, { strict: false });
    expect(records).toHaveLength(0);
  });

  it('returns null record in non-strict mode when directory terminator is missing', () => {
    const leaderStr = '00038nam  2200000   4500';
    const leaderBytes = encodeAscii(leaderStr);
    const buf = new Uint8Array(38);
    buf.set(leaderBytes, 0);
    for (let i = leaderBytes.length; i < buf.length - 1; i++) buf[i] = 0x41;
    buf[buf.length - 1] = 0x1d;
    const records = parseMarcBinary(buf, { strict: false });
    expect(records).toHaveLength(0);
  });

  it('continues in non-strict mode when leader encoding flag is unknown', () => {
    const record: MarcRecord = {
      leader: '00000nam  2200000   4500',
      fields: [{ tag: '001', data: 'test' }],
    };
    const buf = serializeMarcBinary([record]);
    buf[9] = 0x62; // 'b' — invalid encoding flag, defaults to UTF-8
    const records = parseMarcBinary(buf, { strict: false });
    expect(records).toHaveLength(1);
  });

  it('warns when record length in leader is NaN (non-strict)', () => {
    // Leader positions 0-4 are non-numeric
    const buf = new Uint8Array(44);
    const enc = new TextEncoder();
    buf.set(enc.encode('XXXXXnam  2200037   4500'), 0); // NaN record length
    buf.set(enc.encode('001000500000'), 24);
    buf[36] = 0x1e;
    buf.set(enc.encode('hello'), 37);
    buf[42] = 0x1e;
    buf[43] = 0x1d;
    const records = parseMarcBinary(buf, { strict: false });
    expect(Array.isArray(records)).toBe(true);
  });

  it('throws in strict mode when record length in leader is NaN', () => {
    const buf = new Uint8Array(44);
    const enc = new TextEncoder();
    buf.set(enc.encode('XXXXXnam  2200037   4500'), 0);
    buf.set(enc.encode('001000500000'), 24);
    buf[36] = 0x1e;
    buf.set(enc.encode('hello'), 37);
    buf[42] = 0x1e;
    buf[43] = 0x1d;
    expect(() => parseMarcBinary(buf, { strict: true })).toThrow('Invalid record length');
  });

  it('skips invalid directory entry but parses remaining valid entries', () => {
    // First entry is invalid (NaN), second is valid and out-of-bounds.
    // Non-strict: invalid entry is skipped (290-291), valid entry triggers out-of-bounds warning.
    const buffer = buildMalformedRecord('00049nam  2200049   4500', '245XXXX00000001000500000');
    const records = parseMarcBinary(buffer, { strict: false });
    // record is returned (at least one valid directory entry was processed)
    expect(Array.isArray(records)).toBe(true);
  });

  it('skips data field too short for indicators in non-strict mode', () => {
    // Same buffer construction as the strict test but without strict mode
    const dirStr = '245000200000';
    const fieldData = new Uint8Array([0x41, 0x1e]);
    const totalLen = 24 + dirStr.length + 1 + fieldData.length + 1;
    const lenStr = totalLen.toString().padStart(5, '0');
    const baseStr = (24 + dirStr.length + 1).toString().padStart(5, '0');
    const leaderStr = `${lenStr}nam  22${baseStr}   4500`;
    const buffer = buildMalformedRecord(leaderStr, dirStr, fieldData);
    const records = parseMarcBinary(buffer, { strict: false });
    // Field is skipped, record has no fields
    expect(records[0]?.fields).toEqual([]);
  });

  it('warns (non-strict) when subfield delimiter is missing at start of field', () => {
    // Corrupt the first subfield delimiter so it's missing; non-strict path pushes warning
    const record: MarcRecord = {
      leader: '00000nam  2200000   4500',
      fields: [
        {
          tag: '245',
          indicator1: '1',
          indicator2: '0',
          subfields: [{ code: 'a', value: 'Title' }],
        },
      ],
    };
    const buf = serializeMarcBinary([record]);
    for (let i = 30; i < buf.length - 1; i++) {
      if (buf[i] === 0x1f) {
        buf[i] = 0x41; // corrupt the delimiter
        break;
      }
    }
    const records = parseMarcBinary(buf, { strict: false });
    // Field is present but has no subfields (parsing stopped at missing delimiter)
    expect(records[0]?.fields.some((f) => f.tag === '245')).toBe(true);
  });

  it('handles subfield with empty value (delimiter at end of field)', () => {
    // Tests the `if (i >= subfieldBytes.length) break` path (line 479)
    const record: MarcRecord = {
      leader: '00000nam  2200000   4500',
      fields: [
        {
          tag: '245',
          indicator1: '1',
          indicator2: '0',
          subfields: [{ code: 'a', value: '' }], // empty value
        },
      ],
    };
    const buf = serializeMarcBinary([record]);
    const records = parseMarcBinary(buf);
    const field = records[0]?.fields.find((f) => f.tag === '245') as DataField | undefined;
    expect(field?.subfields).toHaveLength(1);
    expect(field?.subfields[0]).toEqual({ code: 'a', value: '' });
  });

  describe('maxWarnings limit in directory and field parsing', () => {
    it('halts directory parsing with truncation warning when maxWarnings hit', () => {
      // 3 invalid entries × 12 bytes each; maxWarnings=2 so first two push warnings,
      // third entry finds warnings.length >= maxWarnings and pushes the truncation warning
      const invalidEntries = 'AAAAAAAAAAAABBBBBBBBBBBBCCCCCCCCCCCC';
      const leader = '00073nam  2200073   4500';
      const buffer = buildMalformedRecord(leader, invalidEntries);
      const records = parseMarcBinary(buffer, { maxWarnings: 2 });
      expect(Array.isArray(records)).toBe(true);
    });

    it('halts field parsing with truncation warning when maxWarnings hit', () => {
      // 3 out-of-bounds fields; maxWarnings=2 so first two push warnings,
      // third field loop iteration finds warnings.length >= maxWarnings
      const buffer = buildMalformedRecord(
        '00073nam  2200073   4500',
        '245000500999650000500998700000500997'
      );
      const records = parseMarcBinary(buffer, { maxWarnings: 2 });
      expect(Array.isArray(records)).toBe(true);
    });
  });
});

describe('parseMarcBinaryWithWarnings', () => {
  it('returns per-record results for valid records', () => {
    const r1: MarcRecord = {
      leader: '00000nam  2200000   4500',
      fields: [{ tag: '001', data: 'rec1' }],
    };
    const r2: MarcRecord = {
      leader: '00000nam  2200000   4500',
      fields: [{ tag: '001', data: 'rec2' }],
    };
    const buffer = serializeMarcBinary([r1, r2]);
    const batch = parseMarcBinaryWithWarnings(buffer);

    expect(batch.results).toHaveLength(2);
    expect(batch.results[0]!.record).not.toBeNull();
    expect(batch.results[1]!.record).not.toBeNull();
    expect(batch.results[0]!.warnings).toEqual([]);
    expect(batch.results[1]!.warnings).toEqual([]);
  });

  it('includes failed records with their warnings', () => {
    const good: MarcRecord = {
      leader: '00000nam  2200000   4500',
      fields: [{ tag: '001', data: 'good' }],
    };
    const goodBuf = serializeMarcBinary([good]);

    // A truncated record that's too short to parse
    const bad = new Uint8Array([0x41, 0x42, 0x1d]);

    const combined = new Uint8Array(goodBuf.length + bad.length);
    combined.set(goodBuf, 0);
    combined.set(bad, goodBuf.length);

    const batch = parseMarcBinaryWithWarnings(combined);

    expect(batch.results).toHaveLength(2);
    expect(batch.results[0]!.record).not.toBeNull();
    expect(batch.results[1]!.record).toBeNull();
    expect(batch.results[1]!.warnings.length).toBeGreaterThan(0);
    expect(batch.results[1]!.warnings[0]!.type).toBe('truncated_record');
  });

  it('returns same records as parseMarcBinary for valid input', () => {
    const records: MarcRecord[] = [
      {
        leader: '00000nam  2200000   4500',
        fields: [
          { tag: '001', data: 'id1' },
          {
            tag: '245',
            indicator1: '1',
            indicator2: '0',
            subfields: [{ code: 'a', value: 'Title One' }],
          },
        ],
      },
      {
        leader: '00000nam  2200000   4500',
        fields: [{ tag: '001', data: 'id2' }],
      },
    ];
    const buffer = serializeMarcBinary(records);

    const plain = parseMarcBinary(buffer);
    const batch = parseMarcBinaryWithWarnings(buffer);
    const batchRecords = batch.results
      .map((r) => r.record)
      .filter((r): r is MarcRecord => r !== null);

    expect(batchRecords).toEqual(plain);
  });

  it('throws in strict mode on the first error', () => {
    const bad = new Uint8Array([0x41, 0x42, 0x1d]);
    expect(() => parseMarcBinaryWithWarnings(bad, { strict: true })).toThrow();
  });

  it('respects maxWarnings per record', () => {
    // Build a record with many out-of-bounds directory entries to generate many warnings
    const buffer = buildMalformedRecord(
      '00073nam  2200073   4500',
      '245000500999650000500998700000500997'
    );
    const batch = parseMarcBinaryWithWarnings(buffer, { maxWarnings: 1 });

    expect(batch.results).toHaveLength(1);
    // maxWarnings=1 means at most ~2 warnings (1 real + 1 truncation)
    expect(batch.results[0]!.warnings.length).toBeLessThanOrEqual(3);
  });

  it('handles a final record with no trailing terminator', () => {
    const record: MarcRecord = {
      leader: '00000nam  2200000   4500',
      fields: [{ tag: '001', data: 'noterm' }],
    };
    const buf = serializeMarcBinary([record]);
    const noTerm = buf.slice(0, buf.length - 1);
    const batch = parseMarcBinaryWithWarnings(noTerm);

    expect(batch.results).toHaveLength(1);
    expect(batch.results[0]!.record).not.toBeNull();
  });
});
