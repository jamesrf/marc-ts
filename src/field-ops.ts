/**
 * Immutable field operation functions.
 * All operations return new records/fields, never mutating the originals.
 */

import type { MarcRecord, ControlField, DataField } from './types';

/**
 * Append a field to the end of a record.
 * Returns a new record, does not mutate the original.
 *
 * @param record - The MARC record
 * @param field - The field to append
 * @returns A new record with the field appended
 *
 * @example
 * ```typescript
 * const newField: DataField = {
 *   tag: '650',
 *   indicator1: ' ',
 *   indicator2: '0',
 *   subfields: [{ code: 'a', value: 'New subject' }],
 * };
 * const updated = appendField(record, newField);
 * // record is unchanged, updated contains the new field
 * ```
 */
export function appendField(record: MarcRecord, field: ControlField | DataField): MarcRecord {
  return {
    ...record,
    fields: [...record.fields, field],
  };
}

/**
 * Insert a field before the first occurrence of a tag.
 * Returns a new record, does not mutate the original.
 *
 * @param record - The MARC record
 * @param tag - The tag to insert before
 * @param field - The field to insert
 * @returns A new record with the field inserted
 *
 * @example
 * ```typescript
 * const newField: DataField = {
 *   tag: '650',
 *   indicator1: ' ',
 *   indicator2: '0',
 *   subfields: [{ code: 'a', value: 'New subject' }],
 * };
 * const updated = insertFieldBefore(record, '700', newField);
 * // Inserts the 650 field before the first 700 field
 * ```
 */
export function insertFieldBefore(
  record: MarcRecord,
  tag: string,
  field: ControlField | DataField
): MarcRecord {
  const index = record.fields.findIndex((f) => f.tag === tag);

  if (index === -1) {
    // Tag not found, append to end
    return appendField(record, field);
  }

  // Optimized: Use Array.from + splice instead of multiple slice operations
  const newFields = Array.from(record.fields);
  newFields.splice(index, 0, field);

  return { ...record, fields: newFields };
}

/**
 * Insert a field after the first occurrence of a tag.
 * Returns a new record, does not mutate the original.
 *
 * @param record - The MARC record
 * @param tag - The tag to insert after
 * @param field - The field to insert
 * @returns A new record with the field inserted
 *
 * @example
 * ```typescript
 * const updated = insertFieldAfter(record, '245', newField);
 * // Inserts the field after the first 245 field
 * ```
 */
export function insertFieldAfter(
  record: MarcRecord,
  tag: string,
  field: ControlField | DataField
): MarcRecord {
  const index = record.fields.findIndex((f) => f.tag === tag);

  if (index === -1) {
    // Tag not found, append to end
    return appendField(record, field);
  }

  // Optimized: Use Array.from + splice instead of multiple slice operations
  const newFields = Array.from(record.fields);
  newFields.splice(index + 1, 0, field);

  return { ...record, fields: newFields };
}

/**
 * Insert a field in MARC block order.
 * Maintains proper MARC21 field ordering: LDR → 00X → 0XX → 1XX → ... → 9XX
 *
 * @param record - The MARC record
 * @param field - The field to insert
 * @returns A new record with the field inserted in proper order
 *
 * @example
 * ```typescript
 * const field650: DataField = {
 *   tag: '650',
 *   indicator1: ' ',
 *   indicator2: '0',
 *   subfields: [{ code: 'a', value: 'Subject' }],
 * };
 * const updated = insertGroupedField(record, field650);
 * // Field is inserted after other 6XX fields but before 7XX fields
 * ```
 */
export function insertGroupedField(
  record: MarcRecord,
  field: ControlField | DataField
): MarcRecord {
  const fieldBlock = getFieldBlock(field.tag);

  // Find insertion point: after last field in same or earlier block
  let insertIndex = record.fields.length; // Default: append to end

  for (let i = 0; i < record.fields.length; i++) {
    const currentField = record.fields[i];
    if (!currentField) continue;

    const currentBlock = getFieldBlock(currentField.tag);

    // If we've moved past our target block, insert here
    if (currentBlock > fieldBlock) {
      insertIndex = i;
      break;
    }
  }

  // Optimized: Use Array.from + splice instead of multiple slice operations
  const newFields = Array.from(record.fields);
  newFields.splice(insertIndex, 0, field);

  return { ...record, fields: newFields };
}

/**
 * Get the MARC block number for a tag (used for field ordering).
 * MARC blocks: 00X=0, 01X=1, 0XX=0-9, 1XX=1, 2XX=2, ..., 9XX=9
 */
function getFieldBlock(tag: string): number {
  const firstChar = tag.charAt(0);
  if (firstChar === '0') {
    // 00X fields are block 0, 01X-09X are blocks 1-9
    const secondChar = tag.charAt(1);
    return parseInt(secondChar ?? '0', 10);
  }
  // 1XX-9XX: use first digit as block number
  return parseInt(firstChar ?? '0', 10);
}

/**
 * Remove all fields with a specific tag.
 * Returns a new record, does not mutate the original.
 *
 * @param record - The MARC record
 * @param tag - The tag of fields to remove
 * @returns A new record with the fields removed
 *
 * @example
 * ```typescript
 * const updated = removeFields(record, '650');
 * // All 650 fields are removed from the returned record
 * ```
 */
export function removeFields(record: MarcRecord, tag: string): MarcRecord {
  return {
    ...record,
    fields: record.fields.filter((f) => f.tag !== tag),
  };
}

/**
 * Remove a specific field instance from a record.
 * Uses reference equality to identify the field.
 *
 * @param record - The MARC record
 * @param field - The specific field instance to remove
 * @returns A new record with the field removed
 *
 * @example
 * ```typescript
 * const field = getField(record, '650');
 * if (field) {
 *   const updated = removeField(record, field);
 *   // That specific field is removed
 * }
 * ```
 */
export function removeField(record: MarcRecord, field: ControlField | DataField): MarcRecord {
  return {
    ...record,
    fields: record.fields.filter((f) => f !== field),
  };
}

/**
 * Add a subfield to a data field.
 * Returns a new field, does not mutate the original.
 *
 * @param field - The data field
 * @param code - The subfield code
 * @param value - The subfield value
 * @returns A new field with the subfield added
 *
 * @example
 * ```typescript
 * const field = getField(record, '245');
 * if (field && isDataField(field)) {
 *   const updated = addSubfield(field, 'c', 'Author name');
 *   // field is unchanged, updated has the new subfield
 * }
 * ```
 */
export function addSubfield(field: DataField, code: string, value: string): DataField {
  return {
    ...field,
    subfields: [...field.subfields, { code, value }],
  };
}

/**
 * Remove all subfields with a specific code from a data field.
 * Returns a new field, does not mutate the original.
 *
 * @param field - The data field
 * @param code - The subfield code to remove
 * @returns A new field with the subfields removed
 *
 * @example
 * ```typescript
 * const updated = removeSubfield(field, 'x');
 * // All $x subfields are removed
 * ```
 */
export function removeSubfield(field: DataField, code: string): DataField {
  return {
    ...field,
    subfields: field.subfields.filter((sf) => sf.code !== code),
  };
}

/**
 * Replace the first subfield with a specific code in a data field.
 * If the subfield doesn't exist, adds it.
 * Returns a new field, does not mutate the original.
 *
 * @param field - The data field
 * @param code - The subfield code to replace
 * @param newValue - The new value for the subfield
 * @returns A new field with the subfield replaced
 *
 * @example
 * ```typescript
 * const updated = replaceSubfield(field, 'a', 'New title');
 * // First $a subfield is replaced with new value
 * ```
 */
export function replaceSubfield(field: DataField, code: string, newValue: string): DataField {
  const index = field.subfields.findIndex((sf) => sf.code === code);

  if (index === -1) {
    // Not found, add new subfield
    return addSubfield(field, code, newValue);
  }

  const newSubfields = [...field.subfields];
  newSubfields[index] = { code, value: newValue };

  return { ...field, subfields: newSubfields };
}
