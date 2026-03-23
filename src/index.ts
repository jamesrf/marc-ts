/**
 * marc-ts: TypeScript MARC21 library with Perl MARC::Record API compatibility
 * for Node.js and browsers.
 *
 * @packageDocumentation
 */

// Core types
export type {
  MarcRecord,
  ControlField,
  DataField,
  Subfield,
  ParseOptions,
  ParseResult,
  MarcWarning,
  MarcWarningType,
} from './types';

export { isControlField, isDataField } from './types';

// Parsing and serialization
export { parseMarcRecord, parseMarcRecordStrict } from './parser';
export { serializeMarcRecord } from './serializer';

// Convenience accessors (Perl MARC::Record compatible)
export {
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
} from './convenience';

// Field access utilities
export { getField, getFields, getSubfield, getSubfields, getAllSubfields } from './field-utils';

// Wildcard querying (Perl MARC::Record compatible)
export { getFieldsByPattern, getFirstFieldByPattern } from './query';

// Field operations (immutable)
export {
  appendField,
  insertFieldBefore,
  insertFieldAfter,
  insertGroupedField,
  removeFields,
  removeField,
  addSubfield,
  removeSubfield,
  replaceSubfield,
} from './field-ops';

// Clone and equality
export { cloneRecord, recordsEqual, fieldsEqual } from './clone';

// Warnings
export { createWarning } from './warnings';
