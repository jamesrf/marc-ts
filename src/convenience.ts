/**
 * Convenience accessor functions for common bibliographic data.
 */

import type { MarcRecord } from './types';
import { isDataField } from './types';
import { getField, getSubfield } from './field-utils';

/**
 * Extract the title from a MARC record (245 $a$b).
 *
 * @param record - The MARC record
 * @returns The title, or undefined if not found
 *
 * @example
 * ```typescript
 * const titleText = title(record);
 * // "The Catcher in the Rye"
 * ```
 */
export function title(record: MarcRecord): string | undefined {
  const field = getField(record, '245');
  if (!field || !isDataField(field)) return undefined;

  // 245 $a$b (title proper + remainder of title)
  const a = getSubfield(field, 'a') ?? '';
  const b = getSubfield(field, 'b') ?? '';

  const combined = (a + ' ' + b).trim();
  return combined || undefined;
}

/**
 * Extract the title proper from a MARC record (245 $a only).
 * This is just the main title without subtitle.
 *
 * @param record - The MARC record
 * @returns The title proper, or undefined if not found
 *
 * @example
 * ```typescript
 * const mainTitle = titleProper(record);
 * // "The Catcher in the Rye"
 * ```
 */
export function titleProper(record: MarcRecord): string | undefined {
  const field = getField(record, '245');
  if (!field || !isDataField(field)) return undefined;
  return getSubfield(field, 'a');
}

/**
 * Extract the author from a MARC record (100 $a or 110 $a).
 *
 * @param record - The MARC record
 * @returns The author name, or undefined if not found
 *
 * @example
 * ```typescript
 * const authorName = author(record);
 * // "Salinger, J. D."
 * ```
 */
export function author(record: MarcRecord): string | undefined {
  // Try 100 $a (personal name)
  const field100 = getField(record, '100');
  if (field100 && isDataField(field100)) {
    return getSubfield(field100, 'a');
  }

  // Try 110 $a (corporate name)
  const field110 = getField(record, '110');
  if (field110 && isDataField(field110)) {
    return getSubfield(field110, 'a');
  }

  return undefined;
}

/**
 * Extract the edition statement from a MARC record (250 $a).
 *
 * @param record - The MARC record
 * @returns The edition statement, or undefined if not found
 *
 * @example
 * ```typescript
 * const ed = edition(record);
 * // "2nd ed."
 * ```
 */
export function edition(record: MarcRecord): string | undefined {
  const field = getField(record, '250');
  if (!field || !isDataField(field)) return undefined;
  return getSubfield(field, 'a');
}

/**
 * Extract the publisher from a MARC record (264 $b or 260 $b).
 * Tries RDA field (264) first, then falls back to AACR2 field (260).
 *
 * @param record - The MARC record
 * @returns The publisher name, or undefined if not found
 *
 * @example
 * ```typescript
 * const pub = publisher(record);
 * // "Little, Brown and Company"
 * ```
 */
export function publisher(record: MarcRecord): string | undefined {
  // Try 264 $b (RDA publication statement)
  const field264 = getField(record, '264');
  if (field264 && isDataField(field264)) {
    const pub = getSubfield(field264, 'b');
    if (pub) return pub;
  }

  // Try 260 $b (AACR2 publication statement)
  const field260 = getField(record, '260');
  if (field260 && isDataField(field260)) {
    return getSubfield(field260, 'b');
  }

  return undefined;
}

/**
 * Extract the publication date from a MARC record (264 $c or 260 $c).
 * Tries RDA field (264) first, then falls back to AACR2 field (260).
 *
 * @param record - The MARC record
 * @returns The publication date, or undefined if not found
 *
 * @example
 * ```typescript
 * const date = publicationDate(record);
 * // "1951"
 * ```
 */
export function publicationDate(record: MarcRecord): string | undefined {
  // Try 264 $c (RDA publication statement)
  const field264 = getField(record, '264');
  if (field264 && isDataField(field264)) {
    const date = getSubfield(field264, 'c');
    if (date) return date;
  }

  // Try 260 $c (AACR2 publication statement)
  const field260 = getField(record, '260');
  if (field260 && isDataField(field260)) {
    return getSubfield(field260, 'c');
  }

  return undefined;
}

/**
 * Extract all ISBNs from a MARC record (020 $a).
 * Returns an array because ISBN is a repeatable field.
 *
 * @param record - The MARC record
 * @returns Array of ISBNs (empty if none found)
 *
 * @example
 * ```typescript
 * const isbns = isbn(record);
 * // ["978-0-316-76948-0", "0-316-76948-7"]
 * ```
 */
export function isbn(record: MarcRecord): string[] {
  const results: string[] = [];

  for (const field of record.fields) {
    if (field.tag === '020' && isDataField(field)) {
      const value = getSubfield(field, 'a');
      if (value) results.push(value);
    }
  }

  return results;
}

/**
 * Extract the ISSN from a MARC record (022 $a).
 *
 * @param record - The MARC record
 * @returns The ISSN, or undefined if not found
 *
 * @example
 * ```typescript
 * const issnValue = issn(record);
 * // "0028-0836"
 * ```
 */
export function issn(record: MarcRecord): string | undefined {
  const field = getField(record, '022');
  if (!field || !isDataField(field)) return undefined;
  return getSubfield(field, 'a');
}

/**
 * Extract the LCCN from a MARC record (010 $a).
 *
 * @param record - The MARC record
 * @returns The LCCN, or undefined if not found
 *
 * @example
 * ```typescript
 * const lccnValue = lccn(record);
 * // "   50011915 "
 * ```
 */
export function lccn(record: MarcRecord): string | undefined {
  const field = getField(record, '010');
  if (!field || !isDataField(field)) return undefined;
  return getSubfield(field, 'a');
}

/**
 * Extract all subject headings from a MARC record (6XX $a).
 * Includes all 6XX fields (600-699).
 *
 * @param record - The MARC record
 * @returns Array of subject headings (empty if none found)
 *
 * @example
 * ```typescript
 * const subjectList = subjects(record);
 * // ["History", "Biography", "Fiction"]
 * ```
 */
export function subjects(record: MarcRecord): string[] {
  const results: string[] = [];

  for (const field of record.fields) {
    // Match all 6XX fields (600-699)
    if (field.tag.startsWith('6') && isDataField(field)) {
      const value = getSubfield(field, 'a');
      if (value) results.push(value);
    }
  }

  return results;
}

/**
 * Extract the series statement from a MARC record (490 $a).
 *
 * @param record - The MARC record
 * @returns The series statement, or undefined if not found
 *
 * @example
 * ```typescript
 * const series = seriesStatement(record);
 * // "Penguin classics"
 * ```
 */
export function seriesStatement(record: MarcRecord): string | undefined {
  const field = getField(record, '490');
  if (!field || !isDataField(field)) return undefined;
  return getSubfield(field, 'a');
}
