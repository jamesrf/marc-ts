/**
 * Wildcard field querying for MARC records.
 * Supports Perl MARC::Record-style wildcard patterns.
 */

import type { MarcRecord, ControlField, DataField } from './types';

/**
 * Check if a MARC tag matches a wildcard pattern.
 * Pattern syntax: digits = exact match, '.' or 'X' (case-insensitive) = any digit
 *
 * @param tag - The MARC tag to test (e.g., '650')
 * @param pattern - The pattern to match against (e.g., '6..', '7XX', '24X')
 * @returns True if the tag matches the pattern
 *
 * @example
 * ```typescript
 * matchesPattern('650', '6..') // true
 * matchesPattern('700', '6..') // false
 * matchesPattern('245', '24X') // true
 * matchesPattern('100', 'X00') // true
 * ```
 */
function matchesPattern(tag: string, pattern: string): boolean {
  if (tag.length !== 3 || pattern.length !== 3) return false;

  for (let i = 0; i < 3; i++) {
    const patternChar = pattern[i];
    const tagChar = tag[i];

    // Wildcard: '.' or 'X' matches any digit
    if (patternChar === '.' || patternChar?.toUpperCase() === 'X') {
      // Verify tag character is a digit
      if (tagChar && !/\d/.test(tagChar)) return false;
      continue;
    }

    // Exact match required
    if (patternChar !== tagChar) return false;
  }

  return true;
}

/**
 * Get all fields matching a wildcard pattern.
 * Perl equivalent: $record->field('6..')
 *
 * @param record - The MARC record to search
 * @param pattern - The pattern to match (e.g., '6..', '7XX', '24X', 'X00')
 * @returns Array of matching fields (empty if none found)
 *
 * @example
 * ```typescript
 * // Get all 6XX subject fields
 * const subjectFields = getFieldsByPattern(record, '6..');
 *
 * // Get all 7XX added entry fields
 * const addedEntries = getFieldsByPattern(record, '7XX');
 *
 * // Get all X00 fields (100, 200, 300, etc.)
 * const x00Fields = getFieldsByPattern(record, 'X00');
 * ```
 */
export function getFieldsByPattern(
  record: MarcRecord,
  pattern: string
): (ControlField | DataField)[] {
  return record.fields.filter((field) => matchesPattern(field.tag, pattern));
}

/**
 * Get the first field matching a wildcard pattern.
 *
 * @param record - The MARC record to search
 * @param pattern - The pattern to match (e.g., '6..', '7XX')
 * @returns The first matching field, or undefined if not found
 *
 * @example
 * ```typescript
 * const firstSubject = getFirstFieldByPattern(record, '6..');
 * if (firstSubject && isDataField(firstSubject)) {
 *   console.log('First subject:', getSubfield(firstSubject, 'a'));
 * }
 * ```
 */
export function getFirstFieldByPattern(
  record: MarcRecord,
  pattern: string
): ControlField | DataField | undefined {
  return record.fields.find((field) => matchesPattern(field.tag, pattern));
}
