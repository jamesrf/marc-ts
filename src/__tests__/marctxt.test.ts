import { describe, it, expect } from 'vitest';
import {
  parseMarcTxt,
  serializeMarcTxt,
} from '../marctxt';
import { recordsEqual } from '../clone';
import type { MarcRecord } from '../types';

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
      subfields: [{ code: 'a', value: 'Hobbits (Fictitious characters)' }],
    },
  ],
};

const SAMPLE_TXT = [
  '=LDR  00706cam a2200217 a 4500',
  '=001  5490',
  '=003  OCoLC',
  '=245  14$aThe Hobbit /$cJ.R.R. Tolkien.',
  '=650  \\1$aHobbits (Fictitious characters)',
  '',
].join('\n');

describe('parseMarcTxt', () => {
  it('parses a single record', () => {
    const records = parseMarcTxt(SAMPLE_TXT);
    expect(records).toHaveLength(1);
    expect(records[0]!.leader).toBe('00706cam a2200217 a 4500');
    expect(records[0]!.fields).toHaveLength(4);
  });

  it('parses control fields correctly', () => {
    const [rec] = parseMarcTxt(SAMPLE_TXT);
    expect(rec!.fields[0]).toMatchObject({ tag: '001', data: '5490' });
    expect(rec!.fields[1]).toMatchObject({ tag: '003', data: 'OCoLC' });
  });

  it('parses data field indicators and subfields', () => {
    const [rec] = parseMarcTxt(SAMPLE_TXT);
    const df = rec!.fields[2] as { tag: string; indicator1: string; indicator2: string; subfields: { code: string; value: string }[] };
    expect(df.tag).toBe('245');
    expect(df.indicator1).toBe('1');
    expect(df.indicator2).toBe('4');
    expect(df.subfields).toHaveLength(2);
    expect(df.subfields[0]).toMatchObject({ code: 'a', value: 'The Hobbit /' });
    expect(df.subfields[1]).toMatchObject({ code: 'c', value: 'J.R.R. Tolkien.' });
  });

  it('decodes blank indicator `\\` as space', () => {
    const [rec] = parseMarcTxt(SAMPLE_TXT);
    const df = rec!.fields[3] as { indicator1: string; indicator2: string };
    expect(df.indicator1).toBe(' ');
    expect(df.indicator2).toBe('1');
  });

  it('parses multiple records separated by blank lines', () => {
    const two = SAMPLE_TXT + '\n' + SAMPLE_TXT;
    const records = parseMarcTxt(two);
    expect(records).toHaveLength(2);
    expect(records[0]!.leader).toBe(records[1]!.leader);
  });

  it('accepts \\r\\n line endings', () => {
    const crlf = SAMPLE_TXT.replace(/\n/g, '\r\n');
    const records = parseMarcTxt(crlf);
    expect(records).toHaveLength(1);
    expect(records[0]!.fields).toHaveLength(4);
  });

  it('returns empty array for empty or whitespace-only input', () => {
    expect(parseMarcTxt('')).toHaveLength(0);
    expect(parseMarcTxt('   \n\n  ')).toHaveLength(0);
  });

  it('parses a record with no trailing blank line', () => {
    const noTrail = SAMPLE_TXT.trimEnd();
    const records = parseMarcTxt(noTrail);
    expect(records).toHaveLength(1);
  });
});

describe('=000 leader (LC spec form)', () => {
  it('parses =000 as the leader, not as a control field', () => {
    const txt = [
      '=000  00000nam a2200000 a 4500',
      '=001  12345',
      '',
    ].join('\n');
    const [rec] = parseMarcTxt(txt);
    expect(rec!.leader).toBe('00000nam a2200000 a 4500');
    expect(rec!.fields).toHaveLength(1);
    expect(rec!.fields[0]).toMatchObject({ tag: '001', data: '12345' });
  });
});


describe('serializeMarcTxt', () => {
  it('produces a =LDR line', () => {
    const txt = serializeMarcTxt([SAMPLE_RECORD]);
    expect(txt).toContain('=LDR  00706cam a2200217 a 4500');
  });

  it('produces control field lines', () => {
    const txt = serializeMarcTxt([SAMPLE_RECORD]);
    expect(txt).toContain('=001  5490');
    expect(txt).toContain('=003  OCoLC');
  });

  it('produces data field lines with indicators', () => {
    const txt = serializeMarcTxt([SAMPLE_RECORD]);
    expect(txt).toContain('=245  14$aThe Hobbit /$cJ.R.R. Tolkien.');
  });

  it('encodes blank indicator as `\\`', () => {
    const txt = serializeMarcTxt([SAMPLE_RECORD]);
    expect(txt).toContain('=650  \\1$aHobbits (Fictitious characters)');
  });

  it('separates multiple records with a blank line', () => {
    const txt = serializeMarcTxt([SAMPLE_RECORD, SAMPLE_RECORD]);
    const ldrMatches = txt.match(/^=LDR/gm) ?? [];
    expect(ldrMatches).toHaveLength(2);
    expect(txt).toContain('\n\n');
  });

  it('round-trips through serialize → parse', () => {
    const txt = serializeMarcTxt([SAMPLE_RECORD]);
    const parsed = parseMarcTxt(txt);
    expect(parsed).toHaveLength(1);
    expect(recordsEqual(SAMPLE_RECORD, parsed[0]!)).toBe(true);
  });

  it('round-trips multiple records', () => {
    const txt = serializeMarcTxt([SAMPLE_RECORD, SAMPLE_RECORD]);
    const parsed = parseMarcTxt(txt);
    expect(parsed).toHaveLength(2);
    expect(recordsEqual(SAMPLE_RECORD, parsed[0]!)).toBe(true);
    expect(recordsEqual(SAMPLE_RECORD, parsed[1]!)).toBe(true);
  });
});

describe('marctxt value escapes', () => {
  it('round-trips a subfield value containing $', () => {
    const rec: MarcRecord = {
      leader: '00000nam a2200000 a 4500',
      fields: [
        {
          tag: '245',
          indicator1: '1',
          indicator2: '0',
          subfields: [{ code: 'a', value: 'Price was $10 in 1985.' }],
        },
      ],
    };
    const parsed = parseMarcTxt(serializeMarcTxt([rec]))[0]!;
    expect(parsed.fields).toHaveLength(1);
    const df = parsed.fields[0] as unknown as { subfields: { code: string; value: string }[] };
    expect(df.subfields).toHaveLength(1);
    expect(df.subfields[0]).toEqual({ code: 'a', value: 'Price was $10 in 1985.' });
  });

  it('replaces embedded newlines with a space on serialize', () => {
    const rec: MarcRecord = {
      leader: '00000nam a2200000 a 4500',
      fields: [
        {
          tag: '520',
          indicator1: ' ',
          indicator2: ' ',
          subfields: [{ code: 'a', value: 'Line one\nLine two' }],
        },
      ],
    };
    const parsed = parseMarcTxt(serializeMarcTxt([rec]))[0]!;
    const df = parsed.fields[0] as unknown as { subfields: { code: string; value: string }[] };
    expect(df.subfields[0]!.value).toBe('Line one Line two');
  });

  it('round-trips literal escape strings present in source data', () => {
    const rec: MarcRecord = {
      leader: '00000nam a2200000 a 4500',
      fields: [
        {
          tag: '500',
          indicator1: ' ',
          indicator2: ' ',
          subfields: [{ code: 'a', value: 'literal {dollar} and {lcub}rcub} braces' }],
        },
      ],
    };
    const parsed = parseMarcTxt(serializeMarcTxt([rec]))[0]!;
    const df = parsed.fields[0] as unknown as { subfields: { code: string; value: string }[] };
    expect(df.subfields[0]!.value).toBe('literal {dollar} and {lcub}rcub} braces');
  });

  it('round-trips a subfield value containing a backslash', () => {
    const rec: MarcRecord = {
      leader: '00000nam a2200000 a 4500',
      fields: [
        {
          tag: '500',
          indicator1: ' ',
          indicator2: ' ',
          subfields: [{ code: 'a', value: 'C:\\Users\\marc' }],
        },
      ],
    };
    const txt = serializeMarcTxt([rec]);
    expect(txt).toContain('{bsol}');
    const parsed = parseMarcTxt(txt)[0]!;
    const df = parsed.fields[0] as unknown as { subfields: { code: string; value: string }[] };
    expect(df.subfields[0]!.value).toBe('C:\\Users\\marc');
  });

  it('round-trips a subfield value containing curly braces', () => {
    const rec: MarcRecord = {
      leader: '00000nam a2200000 a 4500',
      fields: [
        {
          tag: '500',
          indicator1: ' ',
          indicator2: ' ',
          subfields: [{ code: 'a', value: 'set {a, b, c}' }],
        },
      ],
    };
    const txt = serializeMarcTxt([rec]);
    expect(txt).toContain('{lcub}');
    expect(txt).toContain('{rcub}');
    const parsed = parseMarcTxt(txt)[0]!;
    const df = parsed.fields[0] as unknown as { subfields: { code: string; value: string }[] };
    expect(df.subfields[0]!.value).toBe('set {a, b, c}');
  });

  it('decodes {bsol} from spec-compliant input', () => {
    const txt = '=LDR  00000nam a2200000 a 4500\n=500  \\\\$apath is C:{bsol}Users\n';
    const parsed = parseMarcTxt(txt)[0]!;
    const df = parsed.fields[0] as unknown as { subfields: { code: string; value: string }[] };
    expect(df.subfields[0]!.value).toBe('path is C:\\Users');
  });

  it('replaces embedded newlines in control field values with a space on serialize', () => {
    const rec: MarcRecord = {
      leader: '00000nam a2200000 a 4500',
      fields: [{ tag: '008', data: 'first\nsecond' }],
    };
    const parsed = parseMarcTxt(serializeMarcTxt([rec]))[0]!;
    expect(parsed.fields[0]).toEqual({ tag: '008', data: 'first second' });
  });
});
