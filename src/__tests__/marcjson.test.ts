import { describe, it, expect } from 'vitest';
import {
  parseMarcJson,
  serializeMarcJson,
  serializeMarcJsonString,
  type MarcJsonObject,
} from '../marcjson';
import { recordsEqual } from '../clone';
import type { MarcRecord, DataField } from '../types';

const SAMPLE_RECORD: MarcRecord = {
  leader: '00706cam a2200217 a 4500',
  fields: [
    { tag: '001', data: '5490' },
    { tag: '003', data: 'OCoLC' },
    {
      tag: '245',
      indicator1: '1',
      indicator2: '4',
      subfields: [
        { code: 'a', value: 'The Hobbit /' },
        { code: 'c', value: 'J.R.R. Tolkien.' },
      ],
    },
    {
      tag: '650',
      indicator1: ' ',
      indicator2: '1',
      subfields: [{ code: 'a', value: 'Hobbits' }],
    },
  ],
};

const SAMPLE_JSON: MarcJsonObject = {
  leader: '00706cam a2200217 a 4500',
  fields: [
    { '001': '5490' },
    { '003': 'OCoLC' },
    {
      '245': {
        subfields: [{ a: 'The Hobbit /' }, { c: 'J.R.R. Tolkien.' }],
        ind1: '1',
        ind2: '4',
      },
    },
    {
      '650': {
        subfields: [{ a: 'Hobbits' }],
        ind1: ' ',
        ind2: '1',
      },
    },
  ],
};

describe('parseMarcJson', () => {
  it('parses a single object, returning a one-element array', () => {
    const records = parseMarcJson(SAMPLE_JSON);
    expect(records).toHaveLength(1);
    expect(records[0]!.leader).toBe('00706cam a2200217 a 4500');
    expect(records[0]!.fields).toHaveLength(4);
  });

  it('parses a JSON string containing a single object', () => {
    const records = parseMarcJson(JSON.stringify(SAMPLE_JSON));
    expect(records).toHaveLength(1);
    expect(records[0]!.leader).toBe('00706cam a2200217 a 4500');
  });

  it('parses a JSON string containing an array of objects', () => {
    const records = parseMarcJson(JSON.stringify([SAMPLE_JSON, SAMPLE_JSON]));
    expect(records).toHaveLength(2);
    expect(records[0]!.leader).toBe('00706cam a2200217 a 4500');
    expect(records[1]!.leader).toBe('00706cam a2200217 a 4500');
  });

  it('parses a MarcJsonObject[] array', () => {
    const records = parseMarcJson([SAMPLE_JSON, SAMPLE_JSON]);
    expect(records).toHaveLength(2);
  });

  it('parses control fields', () => {
    const records = parseMarcJson(SAMPLE_JSON);
    expect(records[0]!.fields[0]).toMatchObject({ tag: '001', data: '5490' });
    expect(records[0]!.fields[1]).toMatchObject({ tag: '003', data: 'OCoLC' });
  });

  it('parses data fields with indicators and subfields', () => {
    const records = parseMarcJson(SAMPLE_JSON);
    const df = records[0]!.fields[2]! as DataField;
    expect(df.tag).toBe('245');
    expect(df.indicator1).toBe('1');
    expect(df.indicator2).toBe('4');
    expect(df.subfields).toHaveLength(2);
    expect(df.subfields[0]).toMatchObject({ code: 'a', value: 'The Hobbit /' });
  });

  it('defaults missing indicators to space', () => {
    const json: MarcJsonObject = {
      leader: '00000nam a2200000   4500',
      fields: [
        {
          '245': {
            subfields: [{ a: 'No Indicators' }],
            ind1: undefined as unknown as string,
            ind2: undefined as unknown as string,
          },
        },
      ],
    };
    const records = parseMarcJson(json);
    const df = records[0]!.fields[0]! as DataField;
    expect(df.indicator1).toBe(' ');
    expect(df.indicator2).toBe(' ');
  });

  it('throws on missing leader', () => {
    expect(() => parseMarcJson({ leader: undefined as unknown as string, fields: [] })).toThrow(
      /leader/i
    );
  });

  it('throws on non-array fields', () => {
    expect(() =>
      parseMarcJson({ leader: '00000nam a2200000   4500', fields: null as unknown as [] })
    ).toThrow(/fields/i);
  });

  it('throws on field entry with wrong number of keys', () => {
    const json: MarcJsonObject = {
      leader: '00000nam a2200000   4500',
      fields: [{ '001': '5490', '003': 'OCoLC' } as unknown as MarcJsonObject['fields'][number]],
    };
    expect(() => parseMarcJson(json)).toThrow(/exactly one key/i);
  });

  it('throws on data field with invalid subfields', () => {
    const json: MarcJsonObject = {
      leader: '00000nam a2200000   4500',
      fields: [
        {
          '245': {
            subfields: 'not-an-array' as unknown as [],
            ind1: '1',
            ind2: '0',
          },
        },
      ],
    };
    expect(() => parseMarcJson(json)).toThrow(/subfields/i);
  });
});

describe('serializeMarcJson', () => {
  it('produces an array of MarcJsonObjects', () => {
    const arr = serializeMarcJson([SAMPLE_RECORD]);
    expect(Array.isArray(arr)).toBe(true);
    expect(arr).toHaveLength(1);
    expect(arr[0]!.leader).toBe('00706cam a2200217 a 4500');
    expect(arr[0]!.fields).toHaveLength(4);
  });

  it('serializes multiple records', () => {
    const arr = serializeMarcJson([SAMPLE_RECORD, SAMPLE_RECORD]);
    expect(arr).toHaveLength(2);
  });

  it('serializes control fields as { tag: value }', () => {
    const arr = serializeMarcJson([SAMPLE_RECORD]);
    expect(arr[0]!.fields[0]).toEqual({ '001': '5490' });
  });

  it('serializes data fields with ind1, ind2, subfields', () => {
    const arr = serializeMarcJson([SAMPLE_RECORD]);
    const df = arr[0]!.fields[2] as { '245': { ind1: string; ind2: string; subfields: object[] } };
    expect(df['245'].ind1).toBe('1');
    expect(df['245'].ind2).toBe('4');
    expect(df['245'].subfields).toHaveLength(2);
    expect(df['245'].subfields[0]).toEqual({ a: 'The Hobbit /' });
  });

  it('round-trips through serialize → parse and produces equal records', () => {
    const arr = serializeMarcJson([SAMPLE_RECORD]);
    const records = parseMarcJson(arr);
    expect(recordsEqual(SAMPLE_RECORD, records[0]!)).toBe(true);
  });
});

describe('serializeMarcJsonString', () => {
  it('produces valid JSON string (an array)', () => {
    const str = serializeMarcJsonString([SAMPLE_RECORD]);
    const parsed = JSON.parse(str);
    expect(Array.isArray(parsed)).toBe(true);
  });

  it('round-trips through string → parse', () => {
    const str = serializeMarcJsonString([SAMPLE_RECORD]);
    const records = parseMarcJson(str);
    expect(recordsEqual(SAMPLE_RECORD, records[0]!)).toBe(true);
  });

  it('round-trips multiple records', () => {
    const r2: MarcRecord = {
      leader: '00000nam a2200000   4500',
      fields: [{ tag: '001', data: 'second' }],
    };
    const str = serializeMarcJsonString([SAMPLE_RECORD, r2]);
    const records = parseMarcJson(str);
    expect(records).toHaveLength(2);
    expect(recordsEqual(SAMPLE_RECORD, records[0]!)).toBe(true);
    expect((records[1]!.fields[0] as { data: string }).data).toBe('second');
  });
});
