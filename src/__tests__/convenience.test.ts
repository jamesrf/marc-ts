import { describe, it, expect } from 'vitest';
import {
  title,
  titleProper,
  author,
  edition,
  publisher,
  publicationDate,
  isbn,
  issn,
  lccn,
  subjects,
  seriesStatement,
} from '../convenience';
import type { MarcRecord } from '../types';

describe('Convenience Functions', () => {
  const testRecord: MarcRecord = {
    leader: '00000nam  2200000   4500',
    fields: [
      { tag: '001', data: 'ocm12345678' },
      {
        tag: '010',
        indicator1: ' ',
        indicator2: ' ',
        subfields: [{ code: 'a', value: '   50011915 ' }],
      },
      {
        tag: '020',
        indicator1: ' ',
        indicator2: ' ',
        subfields: [{ code: 'a', value: '978-0-316-76948-0' }],
      },
      {
        tag: '020',
        indicator1: ' ',
        indicator2: ' ',
        subfields: [{ code: 'a', value: '0-316-76948-7' }],
      },
      {
        tag: '022',
        indicator1: ' ',
        indicator2: ' ',
        subfields: [{ code: 'a', value: '0028-0836' }],
      },
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
        tag: '250',
        indicator1: ' ',
        indicator2: ' ',
        subfields: [{ code: 'a', value: '1st ed.' }],
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
      {
        tag: '490',
        indicator1: '1',
        indicator2: ' ',
        subfields: [{ code: 'a', value: 'Penguin classics' }],
      },
      {
        tag: '600',
        indicator1: '1',
        indicator2: '0',
        subfields: [{ code: 'a', value: 'Teenage angst' }],
      },
      {
        tag: '650',
        indicator1: ' ',
        indicator2: '0',
        subfields: [{ code: 'a', value: 'Coming of age' }],
      },
      {
        tag: '650',
        indicator1: ' ',
        indicator2: '0',
        subfields: [{ code: 'a', value: 'Fiction' }],
      },
    ],
  };

  describe('title()', () => {
    it('should extract title from 245 $a$b', () => {
      const result = title(testRecord);
      expect(result).toBe('The Catcher in the Rye /');
    });

    it('should return undefined when 245 field is missing', () => {
      const emptyRecord: MarcRecord = { leader: '00000', fields: [] };
      expect(title(emptyRecord)).toBeUndefined();
    });
  });

  describe('titleProper()', () => {
    it('should extract only 245 $a', () => {
      const result = titleProper(testRecord);
      expect(result).toBe('The Catcher in the Rye /');
    });
  });

  describe('author()', () => {
    it('should extract author from 100 $a', () => {
      const result = author(testRecord);
      expect(result).toBe('Salinger, J. D.');
    });

    it('should fallback to 110 $a if 100 is missing', () => {
      const record: MarcRecord = {
        leader: '00000',
        fields: [
          {
            tag: '110',
            indicator1: '2',
            indicator2: ' ',
            subfields: [{ code: 'a', value: 'Corporate Author Inc.' }],
          },
        ],
      };
      expect(author(record)).toBe('Corporate Author Inc.');
    });

    it('should return undefined when author fields are missing', () => {
      const emptyRecord: MarcRecord = { leader: '00000', fields: [] };
      expect(author(emptyRecord)).toBeUndefined();
    });
  });

  describe('edition()', () => {
    it('should extract edition from 250 $a', () => {
      const result = edition(testRecord);
      expect(result).toBe('1st ed.');
    });

    it('should return undefined when 250 field is missing', () => {
      const emptyRecord: MarcRecord = { leader: '00000', fields: [] };
      expect(edition(emptyRecord)).toBeUndefined();
    });
  });

  describe('publisher()', () => {
    it('should extract publisher from 260 $b', () => {
      const result = publisher(testRecord);
      expect(result).toBe('Little, Brown,');
    });

    it('should prefer 264 $b over 260 $b', () => {
      const record: MarcRecord = {
        leader: '00000',
        fields: [
          {
            tag: '264',
            indicator1: ' ',
            indicator2: '1',
            subfields: [{ code: 'b', value: 'RDA Publisher' }],
          },
          {
            tag: '260',
            indicator1: ' ',
            indicator2: ' ',
            subfields: [{ code: 'b', value: 'AACR2 Publisher' }],
          },
        ],
      };
      expect(publisher(record)).toBe('RDA Publisher');
    });
  });

  describe('publicationDate()', () => {
    it('should extract publication date from 260 $c', () => {
      const result = publicationDate(testRecord);
      expect(result).toBe('1951.');
    });

    it('should prefer 264 $c over 260 $c', () => {
      const record: MarcRecord = {
        leader: '00000',
        fields: [
          {
            tag: '264',
            indicator1: ' ',
            indicator2: '1',
            subfields: [{ code: 'c', value: '2024' }],
          },
          {
            tag: '260',
            indicator1: ' ',
            indicator2: ' ',
            subfields: [{ code: 'c', value: '2020' }],
          },
        ],
      };
      expect(publicationDate(record)).toBe('2024');
    });
  });

  describe('isbn()', () => {
    it('should extract all ISBNs from 020 $a', () => {
      const result = isbn(testRecord);
      expect(result).toEqual(['978-0-316-76948-0', '0-316-76948-7']);
    });

    it('should return empty array when no ISBNs present', () => {
      const emptyRecord: MarcRecord = { leader: '00000', fields: [] };
      expect(isbn(emptyRecord)).toEqual([]);
    });
  });

  describe('issn()', () => {
    it('should extract ISSN from 022 $a', () => {
      const result = issn(testRecord);
      expect(result).toBe('0028-0836');
    });

    it('should return undefined when 022 field is missing', () => {
      const emptyRecord: MarcRecord = { leader: '00000', fields: [] };
      expect(issn(emptyRecord)).toBeUndefined();
    });
  });

  describe('lccn()', () => {
    it('should extract LCCN from 010 $a', () => {
      const result = lccn(testRecord);
      expect(result).toBe('   50011915 ');
    });

    it('should return undefined when 010 field is missing', () => {
      const emptyRecord: MarcRecord = { leader: '00000', fields: [] };
      expect(lccn(emptyRecord)).toBeUndefined();
    });
  });

  describe('subjects()', () => {
    it('should extract all 6XX $a subject headings', () => {
      const result = subjects(testRecord);
      expect(result).toEqual(['Teenage angst', 'Coming of age', 'Fiction']);
    });

    it('should return empty array when no subjects present', () => {
      const emptyRecord: MarcRecord = { leader: '00000', fields: [] };
      expect(subjects(emptyRecord)).toEqual([]);
    });
  });

  describe('seriesStatement()', () => {
    it('should extract series statement from 490 $a', () => {
      const result = seriesStatement(testRecord);
      expect(result).toBe('Penguin classics');
    });

    it('should return undefined when 490 field is missing', () => {
      const emptyRecord: MarcRecord = { leader: '00000', fields: [] };
      expect(seriesStatement(emptyRecord)).toBeUndefined();
    });
  });
});
