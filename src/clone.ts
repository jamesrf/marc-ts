/**
 * Deep cloning and equality checking for MARC records.
 */

import type { MarcRecord, ControlField, DataField } from './types';
import { isControlField } from './types';

/**
 * Create a deep clone of a MARC record.
 * Perl equivalent: $record->clone()
 *
 * @param record - The MARC record to clone
 * @returns A new, independent copy of the record
 *
 * @example
 * ```typescript
 * const copy = cloneRecord(record);
 * // Modifying copy will not affect record
 * ```
 */
export function cloneRecord(record: MarcRecord): MarcRecord {
  return {
    leader: record.leader,
    fields: record.fields.map((field) => cloneField(field)),
  };
}

/**
 * Clone a single field (control or data field).
 */
function cloneField(field: ControlField | DataField): ControlField | DataField {
  if (isControlField(field)) {
    return { tag: field.tag, data: field.data };
  }

  return {
    tag: field.tag,
    indicator1: field.indicator1,
    indicator2: field.indicator2,
    subfields: field.subfields.map((sf) => ({ code: sf.code, value: sf.value })),
  };
}

/**
 * Check if two MARC records are deeply equal.
 *
 * @param a - First record to compare
 * @param b - Second record to compare
 * @param ignoreFieldOrder - If true, records with same fields in different order are considered equal
 * @returns True if records are equal
 *
 * @example
 * ```typescript
 * if (recordsEqual(record1, record2)) {
 *   console.log('Records are identical');
 * }
 *
 * // Ignore field order
 * if (recordsEqual(record1, record2, true)) {
 *   console.log('Records have same content');
 * }
 * ```
 */
export function recordsEqual(
  a: MarcRecord,
  b: MarcRecord,
  ignoreFieldOrder = false
): boolean {
  if (a.leader !== b.leader) return false;
  if (a.fields.length !== b.fields.length) return false;

  const fieldsA = ignoreFieldOrder ? [...a.fields].sort(compareFields) : a.fields;
  const fieldsB = ignoreFieldOrder ? [...b.fields].sort(compareFields) : b.fields;

  for (let i = 0; i < fieldsA.length; i++) {
    const fieldA = fieldsA[i];
    const fieldB = fieldsB[i];
    if (!fieldA || !fieldB) return false;
    if (!fieldsEqual(fieldA, fieldB)) return false;
  }

  return true;
}

/**
 * Check if two fields are equal.
 *
 * @param a - First field to compare
 * @param b - Second field to compare
 * @returns True if fields are equal
 *
 * @example
 * ```typescript
 * const field1 = getField(record1, '245');
 * const field2 = getField(record2, '245');
 * if (field1 && field2 && fieldsEqual(field1, field2)) {
 *   console.log('Title fields are identical');
 * }
 * ```
 */
export function fieldsEqual(
  a: ControlField | DataField,
  b: ControlField | DataField
): boolean {
  if (a.tag !== b.tag) return false;

  if (isControlField(a) && isControlField(b)) {
    return a.data === b.data;
  }

  if (!isControlField(a) && !isControlField(b)) {
    if (a.indicator1 !== b.indicator1 || a.indicator2 !== b.indicator2) return false;
    if (a.subfields.length !== b.subfields.length) return false;

    for (let i = 0; i < a.subfields.length; i++) {
      const sfA = a.subfields[i];
      const sfB = b.subfields[i];
      if (!sfA || !sfB) return false;
      if (sfA.code !== sfB.code || sfA.value !== sfB.value) {
        return false;
      }
    }

    return true;
  }

  return false; // One is control field, other is data field
}

/**
 * Compare function for sorting fields by tag.
 */
function compareFields(a: ControlField | DataField, b: ControlField | DataField): number {
  return a.tag.localeCompare(b.tag);
}
