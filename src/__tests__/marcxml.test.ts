import { describe, it, expect } from 'vitest';
import {
  parseMarcXml,
  parseMarcXmlRecord,
  serializeMarcXml,
  serializeMarcXmlRecord,
} from '../marcxml';
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
      subfields: [{ code: 'a', value: 'Hobbits' }],
    },
  ],
};

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<record xmlns="http://www.loc.gov/MARC21/slim">
  <leader>00706cam a2200217 a 4500</leader>
  <controlfield tag="001">5490</controlfield>
  <controlfield tag="003">OCoLC</controlfield>
  <datafield tag="245" ind1="1" ind2="4">
    <subfield code="a">The Hobbit /</subfield>
    <subfield code="c">J.R.R. Tolkien.</subfield>
  </datafield>
  <datafield tag="650" ind1=" " ind2="1">
    <subfield code="a">Hobbits</subfield>
  </datafield>
</record>`;

describe('parseMarcXml', () => {
  it('parses a single <record> element', () => {
    const records = parseMarcXml(SAMPLE_XML);
    expect(records).toHaveLength(1);
    const rec = records[0]!;
    expect(rec.leader).toBe('00706cam a2200217 a 4500');
    expect(rec.fields).toHaveLength(4);
  });

  it('parses control fields correctly', () => {
    const [rec] = parseMarcXml(SAMPLE_XML);
    const cf = rec!.fields[0]!;
    expect(cf).toMatchObject({ tag: '001', data: '5490' });
  });

  it('parses data field indicators and subfields correctly', () => {
    const [rec] = parseMarcXml(SAMPLE_XML);
    const df = rec!.fields[2]! as { tag: string; indicator1: string; indicator2: string; subfields: { code: string; value: string }[] };
    expect(df.tag).toBe('245');
    expect(df.indicator1).toBe('1');
    expect(df.indicator2).toBe('4');
    expect(df.subfields).toHaveLength(2);
    expect(df.subfields[0]).toMatchObject({ code: 'a', value: 'The Hobbit /' });
  });

  it('handles blank indicators as space character', () => {
    const [rec] = parseMarcXml(SAMPLE_XML);
    const df = rec!.fields[3]! as { indicator1: string; indicator2: string };
    expect(df.indicator1).toBe(' ');
  });

  it('parses a <collection> wrapper', () => {
    const collectionXml = `<collection xmlns="http://www.loc.gov/MARC21/slim">
      <record>
        <leader>00000nam a2200000   4500</leader>
        <controlfield tag="001">A</controlfield>
      </record>
      <record>
        <leader>00000nam a2200000   4500</leader>
        <controlfield tag="001">B</controlfield>
      </record>
    </collection>`;
    const records = parseMarcXml(collectionXml);
    expect(records).toHaveLength(2);
    expect((records[0]!.fields[0]! as { data: string }).data).toBe('A');
    expect((records[1]!.fields[0]! as { data: string }).data).toBe('B');
  });

  it('handles namespace prefixes (marc:record)', () => {
    const xml = `<marc:record xmlns:marc="http://www.loc.gov/MARC21/slim">
      <marc:leader>00000nam a2200000   4500</marc:leader>
      <marc:controlfield tag="001">prefixed</marc:controlfield>
    </marc:record>`;
    const records = parseMarcXml(xml);
    expect(records).toHaveLength(1);
    expect((records[0]!.fields[0]! as { data: string }).data).toBe('prefixed');
  });

  it('unescapes XML entities in field data', () => {
    const xml = `<record xmlns="http://www.loc.gov/MARC21/slim">
      <leader>00000nam a2200000   4500</leader>
      <controlfield tag="001">A &amp; B &lt; C</controlfield>
    </record>`;
    const [rec] = parseMarcXml(xml);
    expect((rec!.fields[0]! as { data: string }).data).toBe('A & B < C');
  });

  it('unescapes XML entities in subfield values', () => {
    const xml = `<record xmlns="http://www.loc.gov/MARC21/slim">
      <leader>00000nam a2200000   4500</leader>
      <datafield tag="245" ind1="1" ind2="0">
        <subfield code="a">Title &amp; Subtitle</subfield>
      </datafield>
    </record>`;
    const [rec] = parseMarcXml(xml);
    const df = rec!.fields[0]! as { subfields: { value: string }[] };
    expect(df.subfields[0]!.value).toBe('Title & Subtitle');
  });

  it('returns empty array for XML with no records', () => {
    expect(parseMarcXml('<collection/>')).toHaveLength(0);
    expect(parseMarcXml('')).toHaveLength(0);
  });
});

describe('parseMarcXmlRecord', () => {
  it('returns the first record', () => {
    const rec = parseMarcXmlRecord(SAMPLE_XML);
    expect(rec.leader).toBe('00706cam a2200217 a 4500');
  });

  it('throws when no record is found', () => {
    expect(() => parseMarcXmlRecord('<collection/>')).toThrow(/no marc record/i);
  });
});

describe('serializeMarcXmlRecord', () => {
  it('produces a <record> element', () => {
    const xml = serializeMarcXmlRecord(SAMPLE_RECORD);
    expect(xml).toContain('<record');
    expect(xml).toContain('</record>');
  });

  it('includes the leader', () => {
    const xml = serializeMarcXmlRecord(SAMPLE_RECORD);
    expect(xml).toContain('<leader>00706cam a2200217 a 4500</leader>');
  });

  it('includes control fields', () => {
    const xml = serializeMarcXmlRecord(SAMPLE_RECORD);
    expect(xml).toContain('<controlfield tag="001">5490</controlfield>');
  });

  it('includes data fields with indicators', () => {
    const xml = serializeMarcXmlRecord(SAMPLE_RECORD);
    expect(xml).toContain('<datafield tag="245" ind1="1" ind2="4">');
    expect(xml).toContain('<subfield code="a">The Hobbit /</subfield>');
  });

  it('escapes special XML characters in values', () => {
    const rec: MarcRecord = {
      leader: '00000nam a2200000   4500',
      fields: [{ tag: '001', data: 'A & B < C > D' }],
    };
    const xml = serializeMarcXmlRecord(rec);
    expect(xml).toContain('A &amp; B &lt; C &gt; D');
  });
});

describe('serializeMarcXml', () => {
  it('wraps records in a <collection> element', () => {
    const xml = serializeMarcXml([SAMPLE_RECORD]);
    expect(xml).toContain('<collection');
    expect(xml).toContain('</collection>');
  });

  it('includes an XML declaration', () => {
    const xml = serializeMarcXml([SAMPLE_RECORD]);
    expect(xml).toContain('<?xml version="1.0"');
  });

  it('serializes multiple records', () => {
    const xml = serializeMarcXml([SAMPLE_RECORD, SAMPLE_RECORD]);
    const count = (xml.match(/<record/g) ?? []).length;
    expect(count).toBe(2);
  });

  it('round-trips through serialize → parse', () => {
    const xml = serializeMarcXml([SAMPLE_RECORD]);
    const parsed = parseMarcXml(xml);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.leader).toBe(SAMPLE_RECORD.leader);
    expect(parsed[0]!.fields).toHaveLength(SAMPLE_RECORD.fields.length);
  });
});
