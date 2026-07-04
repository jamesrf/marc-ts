import { describe, it, expect } from 'vitest';
import { getBySpec, getValuesBySpec, parseMarcSpec, MarcSpecParseError } from '../marcspec';
import type { MarcRecord } from '../types';

describe('MARCspec Querying', () => {
  const testRecord: MarcRecord = {
    leader: '00000nam a2200000 a 4500',
    fields: [
      { tag: '001', data: 'test123' },
      { tag: '007', data: 'ta' },
      { tag: '008', data: '000000s2024    xxu||||| |||| 00| 0 eng d' },
      {
        tag: '245',
        indicator1: '1',
        indicator2: '0',
        subfields: [
          { code: 'a', value: 'The Catcher in the Rye /' },
          { code: 'b', value: 'a novel /' },
          { code: 'c', value: 'J.D. Salinger.' },
        ],
      },
      {
        tag: '020',
        indicator1: ' ',
        indicator2: ' ',
        subfields: [
          { code: 'a', value: '9780316769488' },
          { code: 'q', value: 'hardcover' },
          { code: 'c', value: '$25.00' },
          { code: 'z', value: '9780000000000' },
        ],
      },
      {
        tag: '020',
        indicator1: ' ',
        indicator2: ' ',
        subfields: [{ code: 'z', value: '9780000000001' }],
      },
      {
        tag: '020',
        indicator1: ' ',
        indicator2: ' ',
        subfields: [
          { code: 'q', value: 'paperback' },
          { code: 'c', value: '$12.00' },
        ],
      },
      {
        tag: '300',
        indicator1: ' ',
        indicator2: ' ',
        subfields: [{ code: 'a', value: 'First occurrence' }],
      },
      {
        tag: '300',
        indicator1: ' ',
        indicator2: ' ',
        subfields: [{ code: 'a', value: 'Second occurrence' }],
      },
      {
        tag: '300',
        indicator1: ' ',
        indicator2: ' ',
        subfields: [{ code: 'a', value: 'Third occurrence' }],
      },
      {
        tag: '650',
        indicator1: ' ',
        indicator2: '0',
        subfields: [
          { code: 'a', value: 'Fiction' },
          { code: 'x', value: 'Sub A' },
          { code: 'y', value: 'Sub B' },
          { code: 'x', value: 'Sub A repeated' },
        ],
      },
      {
        tag: '880',
        indicator1: '1',
        indicator2: '0',
        subfields: [{ code: 'a', value: 'Alternate graphic' }],
      },
    ],
  };

  describe('parseMarcSpec()', () => {
    it('parses a bare tag', () => {
      expect(parseMarcSpec('245')).toEqual({ tag: '245' });
    });

    it('parses a tag with wildcard digits', () => {
      expect(parseMarcSpec('6..').tag).toBe('6..');
    });

    it('parses a subfield code', () => {
      expect(parseMarcSpec('245$a')).toMatchObject({ tag: '245', subfieldCodes: ['a'] });
    });

    it('parses multiple subfield codes', () => {
      expect(parseMarcSpec('245$a$b$c')).toMatchObject({
        tag: '245',
        subfieldCodes: ['a', 'b', 'c'],
      });
    });

    it('parses a subfield range', () => {
      expect(parseMarcSpec('650$a-c')).toMatchObject({
        tag: '650',
        subfieldRange: { from: 'a', to: 'c' },
      });
    });

    it('parses a field occurrence index', () => {
      expect(parseMarcSpec('300[1]')).toMatchObject({
        tag: '300',
        fieldIndex: { start: 1, end: 1 },
      });
    });

    it('parses a subfield occurrence index', () => {
      expect(parseMarcSpec('650$x[1]')).toMatchObject({
        tag: '650',
        subfieldCodes: ['x'],
        subfieldIndex: { start: 1, end: 1 },
      });
    });

    it('parses a character range', () => {
      expect(parseMarcSpec('245$a/1-3')).toMatchObject({
        tag: '245',
        subfieldCodes: ['a'],
        charRange: { start: 1, end: 3 },
      });
    });

    it('parses a single character position', () => {
      expect(parseMarcSpec('007/0')).toMatchObject({ tag: '007', charRange: { start: 0, end: 0 } });
    });

    it('parses "#" as last-position marker', () => {
      expect(parseMarcSpec('245$a/#')).toMatchObject({ charRange: { start: '#', end: '#' } });
    });

    it('parses a "#"-anchored range', () => {
      expect(parseMarcSpec('245$a/#-1')).toMatchObject({ charRange: { start: '#', end: 1 } });
    });

    it('parses an indicator', () => {
      expect(parseMarcSpec('880^1')).toMatchObject({ tag: '880', indicator: '1' });
    });

    it('parses an indicator with a field index', () => {
      expect(parseMarcSpec('880[0]^2')).toMatchObject({
        tag: '880',
        fieldIndex: { start: 0, end: 0 },
        indicator: '2',
      });
    });

    it('parses LDR with a character range', () => {
      expect(parseMarcSpec('LDR/6')).toMatchObject({ tag: 'LDR', charRange: { start: 6, end: 6 } });
    });

    it('throws MarcSpecParseError for an empty spec', () => {
      expect(() => parseMarcSpec('')).toThrow(MarcSpecParseError);
    });

    it('throws MarcSpecParseError for a short tag', () => {
      expect(() => parseMarcSpec('24')).toThrow(MarcSpecParseError);
    });

    it('throws MarcSpecParseError for a dangling "$"', () => {
      expect(() => parseMarcSpec('245$')).toThrow(MarcSpecParseError);
    });

    it('throws MarcSpecParseError for an invalid indicator', () => {
      expect(() => parseMarcSpec('880^3')).toThrow(MarcSpecParseError);
    });

    it('throws MarcSpecParseError with position info for trailing garbage', () => {
      try {
        parseMarcSpec('245$a extra');
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(MarcSpecParseError);
        expect((err as MarcSpecParseError).position).toBe(5);
      }
    });

    it('parses a predicate subspec with explicit operator and tag', () => {
      expect(parseMarcSpec('020$c{?020$a}')).toMatchObject({
        tag: '020',
        subfieldCodes: ['c'],
        subSpecs: [
          {
            subTermSets: [
              {
                left: undefined,
                operator: '?',
                right: { kind: 'spec', spec: { tag: '020', subfieldCodes: ['a'] } },
              },
            ],
          },
        ],
      });
    });

    it('parses an abbreviated subspec term identically to its fully-qualified form', () => {
      expect(parseMarcSpec('020$c{$a}')).toEqual(parseMarcSpec('020$c{?020$a}'));
    });

    it('parses a subspec with an omitted operator (defaults to "?")', () => {
      expect(parseMarcSpec('020$c{020$a}')).toEqual(parseMarcSpec('020$c{?020$a}'));
    });

    it('parses a "!" (not exists) predicate subspec', () => {
      expect(parseMarcSpec('020$z{!020$a}')).toMatchObject({
        subSpecs: [{ subTermSets: [{ left: undefined, operator: '!', right: { kind: 'spec' } }] }],
      });
    });

    it('parses an OR ("|") of comparison subterms', () => {
      const ast = parseMarcSpec('020$c{$q=\\paperback|$q=\\hardcover}');
      expect(ast.subSpecs).toHaveLength(1);
      expect(ast.subSpecs?.[0].subTermSets).toEqual([
        {
          left: { kind: 'spec', spec: { tag: '020', subfieldCodes: ['q'] } },
          operator: '=',
          right: { kind: 'string', value: 'paperback' },
        },
        {
          left: { kind: 'spec', spec: { tag: '020', subfieldCodes: ['q'] } },
          operator: '=',
          right: { kind: 'string', value: 'hardcover' },
        },
      ]);
    });

    it('parses AND ("{...}{...}") of adjacent subspecs', () => {
      const ast = parseMarcSpec('008/18{LDR/6=\\a}{LDR/7=\\a|LDR/7=\\c}');
      expect(ast.subSpecs).toHaveLength(2);
    });

    it('parses comparison string escapes, including "\\s" as a space', () => {
      const ast = parseMarcSpec('020$c{$q=\\Sub\\sA\\$\\{\\}}');
      expect(ast.subSpecs?.[0].subTermSets[0].right).toEqual({ kind: 'string', value: 'Sub A${}' });
    });

    it('throws MarcSpecParseError for an empty subspec', () => {
      expect(() => parseMarcSpec('020$c{}')).toThrow(MarcSpecParseError);
    });

    it('throws MarcSpecParseError for an unterminated subspec', () => {
      expect(() => parseMarcSpec('020$c{?020$a')).toThrow(MarcSpecParseError);
    });

    it('throws MarcSpecParseError for an unescaped operator character in a comparison string', () => {
      expect(() => parseMarcSpec('020$c{$q=\\paper=back}')).toThrow(MarcSpecParseError);
    });

    it('throws MarcSpecParseError for an invalid escape sequence in a comparison string', () => {
      expect(() => parseMarcSpec('020$c{$q=\\pa\\xper}')).toThrow(MarcSpecParseError);
    });

    it('throws MarcSpecParseError for a nested subspec-in-subspec', () => {
      expect(() => parseMarcSpec('020$c{$a{$b}}')).toThrow(MarcSpecParseError);
    });
  });

  describe('getBySpec()', () => {
    it('resolves a bare control field tag', () => {
      expect(getBySpec(testRecord, '001')).toEqual([
        { tag: '001', occurrence: 0, value: 'test123' },
      ]);
    });

    it('resolves LDR to the full leader', () => {
      expect(getBySpec(testRecord, 'LDR')).toEqual([
        { tag: 'LDR', occurrence: 0, value: testRecord.leader },
      ]);
    });

    it('resolves a character range on a control field', () => {
      expect(getValuesBySpec(testRecord, '007/1')).toEqual(['a']);
    });

    it('resolves "last character" with "#"', () => {
      expect(getValuesBySpec(testRecord, '001/#')).toEqual(['3']);
    });

    it('resolves a single subfield', () => {
      expect(getValuesBySpec(testRecord, '245$a')).toEqual(['The Catcher in the Rye /']);
    });

    it('resolves multiple subfield codes in order', () => {
      expect(getValuesBySpec(testRecord, '245$a$c')).toEqual([
        'The Catcher in the Rye /',
        'J.D. Salinger.',
      ]);
    });

    it('resolves a subfield range', () => {
      expect(getValuesBySpec(testRecord, '650$x-y')).toEqual(['Sub A', 'Sub B', 'Sub A repeated']);
    });

    it('resolves a character range on a subfield value', () => {
      expect(getValuesBySpec(testRecord, '245$a/0-2')).toEqual(['The']);
    });

    it('resolves the last character of a subfield with "#"', () => {
      expect(getValuesBySpec(testRecord, '245$c/#')).toEqual(['.']);
    });

    it('resolves the first occurrence of a repeated field with [0]', () => {
      expect(getValuesBySpec(testRecord, '300[0]$a')).toEqual(['First occurrence']);
    });

    it('resolves the last occurrence of a repeated field with [#]', () => {
      expect(getValuesBySpec(testRecord, '300[#]$a')).toEqual(['Third occurrence']);
    });

    it('resolves a range of field occurrences', () => {
      expect(getValuesBySpec(testRecord, '300[0-1]$a')).toEqual([
        'First occurrence',
        'Second occurrence',
      ]);
    });

    it('resolves a specific occurrence of a repeated subfield', () => {
      expect(getValuesBySpec(testRecord, '650$x[0]')).toEqual(['Sub A']);
      expect(getValuesBySpec(testRecord, '650$x[1]')).toEqual(['Sub A repeated']);
      expect(getValuesBySpec(testRecord, '650$x[#]')).toEqual(['Sub A repeated']);
    });

    it('resolves an indicator value', () => {
      expect(getValuesBySpec(testRecord, '245^1')).toEqual(['1']);
      expect(getValuesBySpec(testRecord, '245^2')).toEqual(['0']);
    });

    it('resolves an indicator for a specific field occurrence', () => {
      expect(getValuesBySpec(testRecord, '880[0]^1')).toEqual(['1']);
    });

    it('resolves a combined occurrence + subfield + character range spec', () => {
      expect(getValuesBySpec(testRecord, '300[1]$a/0-2')).toEqual(['Sec']);
    });

    it('resolves wildcard tag patterns', () => {
      const values = getValuesBySpec(testRecord, '6..$a');
      expect(values).toEqual(['Fiction']);
    });

    it('returns an empty array for a valid spec with no matching field', () => {
      expect(getBySpec(testRecord, '999')).toEqual([]);
      expect(getBySpec(testRecord, '999$a')).toEqual([]);
    });

    it('returns an empty array when subfield code is absent on an existing field', () => {
      expect(getBySpec(testRecord, '245$z')).toEqual([]);
    });

    it('returns an empty array for a data field addressed without subfields (no scalar value)', () => {
      expect(getBySpec(testRecord, '245')).toEqual([]);
    });

    it('ignores control fields when a subfield selector is present', () => {
      expect(getBySpec(testRecord, '001$a')).toEqual([]);
    });

    it('ignores data fields when no subfield/indicator selector is present', () => {
      expect(getBySpec(testRecord, '300')).toEqual([]);
    });

    it('does not mutate the input record', () => {
      const before = JSON.parse(JSON.stringify(testRecord));
      getBySpec(testRecord, '245$a/0-2');
      expect(testRecord).toEqual(before);
    });

    it('propagates MarcSpecParseError for malformed specs', () => {
      expect(() => getBySpec(testRecord, '24')).toThrow(MarcSpecParseError);
    });

    it('resolves an existence-check predicate, keeping only occurrences with the referenced sibling', () => {
      // Occurrence 0 has both $a and $c -> kept; occurrence 2 has $c but no $a -> filtered out.
      expect(getValuesBySpec(testRecord, '020$c{?020$a}')).toEqual(['$25.00']);
    });

    it('resolves a negated existence-check predicate', () => {
      // Occurrence 0 has $z but also has $a -> filtered out; occurrence 1 has $z and no $a -> kept.
      expect(getValuesBySpec(testRecord, '020$z{!020$a}')).toEqual(['9780000000001']);
    });

    it('resolves an OR of equality comparisons against literal strings', () => {
      // Occurrence 0 ($q=hardcover) and occurrence 2 ($q=paperback) both satisfy the OR.
      expect(getValuesBySpec(testRecord, '020$c{$q=\\paperback|$q=\\hardcover}')).toEqual([
        '$25.00',
        '$12.00',
      ]);
    });

    it('resolves an AND of adjacent subspecs referencing LDR', () => {
      const record: MarcRecord = {
        ...testRecord,
        leader: '00000nac a2200000 a 4500', // LDR/6 = 'a', LDR/7 = 'c'
      };
      expect(getValuesBySpec(record, '008/18{LDR/6=\\a}{LDR/7=\\a|LDR/7=\\c}')).toEqual(['|']);
    });

    it('returns an empty array when one of several AND-ed subspecs fails', () => {
      const record: MarcRecord = {
        ...testRecord,
        leader: '00000nax a2200000 a 4500', // LDR/6 = 'a', LDR/7 = 'x' (fails second clause)
      };
      expect(getBySpec(record, '008/18{LDR/6=\\a}{LDR/7=\\a|LDR/7=\\c}')).toEqual([]);
    });

    it('resolves a cross-tag OR predicate attached to a subfieldSpec', () => {
      // 007 data is 'ta', so 007/0 = 't', matching the second OR branch.
      expect(getValuesBySpec(testRecord, '245$b{007/0=\\a|007/0=\\t}')).toEqual(['a novel /']);
    });

    it('returns an empty array when no occurrence satisfies the subspec', () => {
      expect(getBySpec(testRecord, '020$a{020$q=\\imaginary}')).toEqual([]);
    });

    it('distinguishes "=" (equal) from "~" (includes) semantics', () => {
      const record: MarcRecord = {
        leader: testRecord.leader,
        fields: [
          {
            tag: '020',
            indicator1: ' ',
            indicator2: ' ',
            subfields: [
              { code: 'a', value: 'value' },
              { code: 'q', value: 'a substring of value' },
            ],
          },
        ],
      };
      expect(getValuesBySpec(record, '020$a{$q=\\value}')).toEqual([]); // not exactly equal
      expect(getValuesBySpec(record, '020$a{$q~\\value}')).toEqual(['value']); // substring match
    });

    it('evaluates "!=" and "!~" as the negation of "=" / "~" (no matching pair), not existential inequality', () => {
      const record: MarcRecord = {
        leader: testRecord.leader,
        fields: [
          {
            tag: '020',
            indicator1: ' ',
            indicator2: ' ',
            subfields: [
              { code: 'a', value: 'same' },
              { code: 'q', value: 'same' },
            ],
          },
        ],
      };
      // left ($a='same') and right ($q='same') match exactly -> '!=' is false, '!~' is false.
      expect(getBySpec(record, '020$a{$a!=$q}')).toEqual([]);
      expect(getBySpec(record, '020$a{$a!~$q}')).toEqual([]);
    });

    it('propagates MarcSpecParseError for malformed subspecs', () => {
      expect(() => getBySpec(testRecord, '020$c{}')).toThrow(MarcSpecParseError);
    });

    it('resolves a subspec whose nested subTerm references an indicator', () => {
      // 245's indicator1 is '1', so this keeps the field; a non-matching value filters it out.
      expect(getValuesBySpec(testRecord, '245$a{^1=\\1}')).toEqual(['The Catcher in the Rye /']);
      expect(getValuesBySpec(testRecord, '245$a{^1=\\9}')).toEqual([]);
    });

    it('returns an empty array when a subspec attached to LDR is false', () => {
      expect(getBySpec(testRecord, 'LDR/6{LDR/6=\\z}')).toEqual([]);
      expect(getValuesBySpec(testRecord, 'LDR/6{LDR/6=\\a}')).toEqual(['a']);
    });

    it('does not mutate the input record when evaluating a subspec', () => {
      const before = JSON.parse(JSON.stringify(testRecord));
      getBySpec(testRecord, '020$c{?020$a}');
      expect(testRecord).toEqual(before);
    });
  });

  describe('getValuesBySpec()', () => {
    it('returns only the resolved values', () => {
      expect(getValuesBySpec(testRecord, '650$a')).toEqual(['Fiction']);
    });

    it('returns an empty array for no matches', () => {
      expect(getValuesBySpec(testRecord, '999$a')).toEqual([]);
    });
  });
});
