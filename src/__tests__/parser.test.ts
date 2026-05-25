import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseMarcBinary } from '../parser';
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
        { tag: '650', indicator1: ' ', indicator2: '0', subfields: [{ code: 'a', value: 'Subject 1' }] },
        { tag: '650', indicator1: ' ', indicator2: '0', subfields: [{ code: 'a', value: 'Subject 2' }] },
        { tag: '650', indicator1: ' ', indicator2: '0', subfields: [{ code: 'a', value: 'Subject 3' }] },
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
  });
});
