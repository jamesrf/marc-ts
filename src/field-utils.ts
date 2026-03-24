/**
 * Basic field and subfield access utilities.
 * Provides simple getter functions for accessing MARC record data.
 */

import type { MarcRecord, ControlField, DataField } from './types';

/**
 * Get the first field with the specified tag.
 *
 * @param record - The MARC record to search
 * @param tag - The field tag to find (e.g., '245', '100')
 * @returns The first matching field, or undefined if not found
 *
 * @example
 * ```typescript
 * const titleField = getField(record, '245');
 * if (titleField && isDataField(titleField)) {
 *   console.log('Title field found');
 * }
 * ```
 */
export function getField(record: MarcRecord, tag: string): ControlField | DataField | undefined {
  return record.fields.find((f) => f.tag === tag);
}

/**
 * Get all fields with the specified tag.
 *
 * @param record - The MARC record to search
 * @param tag - The field tag to find (e.g., '650', '700')
 * @returns Array of matching fields (empty if none found)
 *
 * @example
 * ```typescript
 * const subjectFields = getFields(record, '650');
 * console.log(`Found ${subjectFields.length} subject fields`);
 * ```
 */
export function getFields(record: MarcRecord, tag: string): (ControlField | DataField)[] {
  return record.fields.filter((f) => f.tag === tag);
}

/**
 * Get the first subfield with the specified code from a data field.
 *
 * @param field - The data field to search
 * @param code - The subfield code to find (e.g., 'a', 'b')
 * @returns The subfield value, or undefined if not found
 *
 * @example
 * ```typescript
 * const field = getField(record, '245');
 * if (field && isDataField(field)) {
 *   const title = getSubfield(field, 'a');
 *   console.log('Title:', title);
 * }
 * ```
 */
export function getSubfield(field: DataField, code: string): string | undefined {
  const subfield = field.subfields.find((sf) => sf.code === code);
  return subfield?.value;
}

/**
 * Get all subfields with the specified code from a data field.
 * Useful for repeatable subfields.
 *
 * @param field - The data field to search
 * @param code - The subfield code to find (e.g., 'a', 'x')
 * @returns Array of subfield values (empty if none found)
 *
 * @example
 * ```typescript
 * const field = getField(record, '650');
 * if (field && isDataField(field)) {
 *   const subdivisions = getSubfields(field, 'x');
 *   console.log('Subdivisions:', subdivisions);
 * }
 * ```
 */
export function getSubfields(field: DataField, code: string): string[] {
  return field.subfields.filter((sf) => sf.code === code).map((sf) => sf.value);
}

/**
 * Get all subfields from a data field as an array of {code, value} pairs.
 *
 * @param field - The data field
 * @returns Array of subfield objects
 *
 * @example
 * ```typescript
 * const field = getField(record, '245');
 * if (field && isDataField(field)) {
 *   const allSubfields = getAllSubfields(field);
 *   for (const sf of allSubfields) {
 *     console.log(`$${sf.code}: ${sf.value}`);
 *   }
 * }
 * ```
 */
export function getAllSubfields(field: DataField): Array<{ code: string; value: string }> {
  return field.subfields.map((sf) => ({ code: sf.code, value: sf.value }));
}
