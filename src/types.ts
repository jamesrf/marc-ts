/**
 * Core type definitions for MARC21 records.
 * All types use readonly modifiers to enforce immutability.
 */

/**
 * A subfield within a MARC data field.
 * Contains a single-character code and its associated value.
 *
 * @example
 * ```typescript
 * const subfield: Subfield = { code: 'a', value: 'The Catcher in the Rye' };
 * ```
 */
export interface Subfield {
  readonly code: string;
  readonly value: string;
}

/**
 * A MARC control field (tag 00X).
 * Control fields have no indicators or subfields, only a tag and data.
 *
 * @example
 * ```typescript
 * const controlField: ControlField = { tag: '001', data: 'ocm12345678' };
 * ```
 */
export interface ControlField {
  readonly tag: string;
  readonly data: string;
}

/**
 * A MARC data field (tag 01X-9XX).
 * Data fields have a tag, two indicators, and one or more subfields.
 *
 * @example
 * ```typescript
 * const dataField: DataField = {
 *   tag: '245',
 *   indicator1: '1',
 *   indicator2: '0',
 *   subfields: [
 *     { code: 'a', value: 'The Catcher in the Rye /' },
 *     { code: 'c', value: 'J.D. Salinger.' },
 *   ],
 * };
 * ```
 */
export interface DataField {
  readonly tag: string;
  readonly indicator1: string; // Use ' ' for blank indicator
  readonly indicator2: string; // Use ' ' for blank indicator
  readonly subfields: readonly Subfield[];
}

/**
 * A complete MARC21 record.
 * Contains a 24-character leader and an array of fields (control or data fields).
 *
 * @example
 * ```typescript
 * const record: MarcRecord = {
 *   leader: '00000nam  2200000   4500',
 *   fields: [
 *     { tag: '001', data: 'ocm12345678' },
 *     {
 *       tag: '245',
 *       indicator1: '1',
 *       indicator2: '0',
 *       subfields: [{ code: 'a', value: 'Title' }],
 *     },
 *   ],
 * };
 * ```
 */
export interface MarcRecord {
  readonly leader: string; // Always 24 characters
  readonly fields: readonly (ControlField | DataField)[];
}

/**
 * Warning type categories for MARC parsing errors.
 */
export type MarcWarningType =
  | 'invalid_leader'
  | 'invalid_directory'
  | 'invalid_field'
  | 'truncated_record'
  | 'encoding_error';

/**
 * A warning generated during MARC record parsing.
 * Warnings indicate non-fatal issues that were encountered and recovered from.
 */
export interface MarcWarning {
  readonly type: MarcWarningType;
  readonly message: string;
  readonly position?: number; // Byte position in the record
  readonly tag?: string; // Field tag associated with the warning
}

/**
 * Options for parsing MARC records.
 */
export interface ParseOptions {
  /**
   * If true, throw errors instead of collecting warnings.
   * Default: false (matches Perl MARC::Record behavior)
   */
  readonly strict?: boolean;

  /**
   * Maximum number of warnings to collect before stopping.
   * Prevents memory issues with severely malformed records.
   * Default: 100
   */
  readonly maxWarnings?: number;
}

/**
 * Result of parsing a MARC record.
 * Contains the parsed record (if successful) and any warnings encountered.
 */
export interface ParseResult {
  readonly record: MarcRecord | null;
  readonly warnings: readonly MarcWarning[];
}

/**
 * Type guard to check if a field is a control field.
 *
 * @param field - The field to check
 * @returns True if the field is a control field
 *
 * @example
 * ```typescript
 * if (isControlField(field)) {
 *   console.log(field.data); // TypeScript knows field is ControlField
 * }
 * ```
 */
export function isControlField(field: ControlField | DataField): field is ControlField {
  return 'data' in field;
}

/**
 * Type guard to check if a field is a data field.
 *
 * @param field - The field to check
 * @returns True if the field is a data field
 *
 * @example
 * ```typescript
 * if (isDataField(field)) {
 *   console.log(field.subfields); // TypeScript knows field is DataField
 * }
 * ```
 */
export function isDataField(field: ControlField | DataField): field is DataField {
  return 'subfields' in field;
}
