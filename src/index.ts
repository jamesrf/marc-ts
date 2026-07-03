/**
 * marc-ts: TypeScript MARC21 library for Node.js and browsers.
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
  ParseBatchResult,
  SerializeRecordResult,
  SerializeBatchResult,
  MarcWarning,
  MarcWarningType,
} from './types';

export { isControlField, isDataField } from './types';

// Parsing and serialization
export { parseMarcBinary, parseMarcBinaryWithWarnings } from './parser';
export { serializeMarcBinary, serializeMarcBinaryWithWarnings } from './serializer';
export type { SerializeOptions } from './serializer';

// MARC8 codec (useful for raw byte-level interop)
export { marc8ToUnicode, unicodeToMarc8, unicodeToMarc8WithStats } from './marc8';
export type { Marc8EncodeResult } from './marc8';

// Convenience accessors
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

// Wildcard querying
export { getFieldsByPattern, getFirstFieldByPattern } from './query';

// MARCspec querying
export { getBySpec, getValuesBySpec, parseMarcSpec, MarcSpecParseError } from './marcspec';
export type { MarcSpecAst, MarcSpecMatch } from './marcspec';

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
