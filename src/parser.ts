/**
 * ISO2709 binary format parser for MARC21 records.
 * Supports UTF-8 encoding with heuristic detection and error recovery.
 */

import type {
  MarcRecord,
  ControlField,
  DataField,
  Subfield,
  ParseOptions,
  ParseResult,
  ParseBatchResult,
  MarcWarning,
  MarcWarningType,
} from './types';
import { marc8ToUnicode } from './marc8';

// ISO2709 separator characters
const SUBFIELD_DELIMITER = 0x1f; // ASCII 31 (IS1 - Unit Separator)
const FIELD_TERMINATOR = 0x1e; // ASCII 30 (IS2 - Information Separator)

// Leader constants
const LEADER_LENGTH = 24;
const DIRECTORY_ENTRY_LENGTH = 12;
const TAG_LENGTH = 3;
const FIELD_LENGTH_SIZE = 4;

// Shared TextDecoder for performance - safe to reuse as UTF-8 decoding is stateless
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: false });

/**
 * Best-effort decoder used when the primary decode raises. Falls back to a
 * non-fatal UTF-8 decode so callers retain the shape of the record (with
 * U+FFFD where bytes were invalid) rather than losing the field entirely.
 */
function bestEffortDecode(bytes: Uint8Array): string {
  return UTF8_DECODER.decode(bytes);
}

/**
 * Format a byte slice as a short hex preview for warning messages.
 * Truncates long sequences so warnings stay readable.
 */
function bytesPreview(bytes: Uint8Array, max = 16): string {
  const slice = bytes.slice(0, max);
  const hex = Array.from(slice, (b) => b.toString(16).padStart(2, '0')).join(' ');
  return bytes.length > max ? `${hex} … (${bytes.length} bytes)` : hex;
}

/**
 * Internal representation of a directory entry.
 */
interface DirectoryEntry {
  tag: string;
  fieldLength: number;
  startingPosition: number;
}

function parseMarcRecord(buffer: Uint8Array, options: ParseOptions = {}): ParseResult {
  const strict = options.strict ?? false;
  const maxWarnings = options.maxWarnings ?? 100;
  const warnings: MarcWarning[] = [];

  // Validate minimum record length
  if (buffer.length < LEADER_LENGTH + 1) {
    // Leader + terminator
    const warning = createWarning('truncated_record', `Record too short: ${buffer.length} bytes`);
    if (strict) throw new Error(warning.message);
    warnings.push(warning);
    return { record: null, warnings };
  }

  // Parse leader
  const leader = decodeLeader(buffer);
  if (!validateLeader(leader, warnings, strict)) {
    if (strict || warnings.length >= maxWarnings) {
      return { record: null, warnings };
    }
  }

  // Extract record length from Leader positions 00-04
  const recordLength = parseInt(leader.substring(0, 5), 10);
  if (isNaN(recordLength) || recordLength > buffer.length) {
    const warning = createWarning(
      'invalid_leader',
      `Invalid record length in leader: ${leader.substring(0, 5)}`
    );
    if (strict) throw new Error(warning.message);
    warnings.push(warning);
    // Continue with actual buffer length
  } else if (recordLength < buffer.length) {
    // Buffer contains trailing bytes beyond the record. Typically a sign that
    // the caller passed a concatenated stream — they should split on
    // RECORD_TERMINATOR first. Slice down so subsequent indexing doesn't read
    // into the next record's data.
    const warning = createWarning(
      'truncated_record',
      `Buffer is longer than the record length declared in the leader: ` +
        `leader says ${recordLength}, buffer is ${buffer.length} bytes. ` +
        `Trailing bytes ignored (likely a concatenated stream — split on 0x1D first).`
    );
    if (strict) throw new Error(warning.message);
    warnings.push(warning);
    buffer = buffer.slice(0, recordLength);
  }

  // Extract base address from Leader positions 12-16
  const baseAddress = parseInt(leader.substring(12, 17), 10);
  if (isNaN(baseAddress)) {
    const warning = createWarning(
      'invalid_leader',
      `Invalid base address in leader: ${leader.substring(12, 17)}`
    );
    if (strict) throw new Error(warning.message);
    warnings.push(warning);
    return { record: null, warnings };
  }

  // Parse directory (starts at byte 24, ends at first FIELD_TERMINATOR)
  const directoryStart = LEADER_LENGTH;
  const directoryEnd = buffer.indexOf(FIELD_TERMINATOR, directoryStart);
  if (directoryEnd === -1) {
    const warning = createWarning('invalid_directory', 'Directory terminator not found');
    if (strict) throw new Error(warning.message);
    warnings.push(warning);
    return { record: null, warnings };
  }

  const directoryBytes = buffer.slice(directoryStart, directoryEnd);
  const directoryEntries = parseDirectory(directoryBytes, warnings, strict, maxWarnings);

  if (directoryEntries.length === 0) {
    const warning = createWarning('invalid_directory', 'No directory entries found');
    if (strict) throw new Error(warning.message);
    warnings.push(warning);
    return { record: null, warnings };
  }

  // Select decoder based on leader byte 9: ' ' = MARC8, 'a' = UTF-8
  const isMarc8 = leader[9] === ' ';
  if (leader[9] !== ' ' && leader[9] !== 'a') {
    const warning = createWarning(
      'invalid_leader',
      `Leader position 9 (encoding flag) is '${leader[9]}'; expected 'a' (UTF-8) or ' ' (MARC-8). Defaulting to UTF-8.`
    );
    if (strict) throw new Error(warning.message);
    warnings.push(warning);
  }
  const decodeBytes: (b: Uint8Array) => string = isMarc8
    ? marc8ToUnicode
    : (b) => UTF8_DECODER.decode(b);

  // Parse fields using directory entries
  const fields = parseFields(buffer, directoryEntries, baseAddress, decodeBytes, warnings, strict, maxWarnings);

  return {
    record: { leader, fields },
    warnings,
  };
}

// The RECORD_TERMINATOR byte that separates concatenated ISO2709 records.
const RECORD_TERMINATOR = 0x1d;

/**
 * Parse a concatenated ISO2709 binary stream into an array of MARC records.
 *
 * Records in the stream are separated by 0x1D (RECORD_TERMINATOR). Each slice
 * is parsed with {@link parseMarcRecord}; slices that produce a null record
 * (e.g. due to encoding errors in lenient mode) are silently skipped.
 *
 * @param buffer - Binary data containing one or more concatenated MARC records
 * @param options - Parsing options forwarded to the per-record parser
 * @returns Array of successfully parsed MARC records
 */
export function parseMarcBinary(buffer: Uint8Array, options?: ParseOptions): MarcRecord[] {
  const records: MarcRecord[] = [];
  let start = 0;
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === RECORD_TERMINATOR) {
      const slice = buffer.slice(start, i + 1);
      if (slice.length > 0) {
        const result = parseMarcRecord(slice, options);
        if (result.record) records.push(result.record);
      }
      start = i + 1;
    }
  }
  // Handle a final record with no trailing terminator
  if (start < buffer.length) {
    const slice = buffer.slice(start);
    const result = parseMarcRecord(slice, options);
    if (result.record) records.push(result.record);
  }
  return records;
}

/**
 * Parse a concatenated ISO2709 binary stream, returning per-record
 * parse results including any warnings.
 *
 * Unlike {@link parseMarcBinary}, records that fail to parse are
 * included in the results array (with `record: null`) so callers
 * can inspect their warnings.
 */
export function parseMarcBinaryWithWarnings(
  buffer: Uint8Array,
  options?: ParseOptions
): ParseBatchResult {
  const results: ParseResult[] = [];
  let start = 0;

  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === RECORD_TERMINATOR) {
      const slice = buffer.slice(start, i + 1);
      if (slice.length > 0) {
        results.push(parseMarcRecord(slice, options));
      }
      start = i + 1;
    }
  }

  if (start < buffer.length) {
    const slice = buffer.slice(start);
    results.push(parseMarcRecord(slice, options));
  }

  return { results };
}

/**
 * Decode the leader from the buffer.
 */
function decodeLeader(buffer: Uint8Array): string {
  const leaderBytes = buffer.slice(0, LEADER_LENGTH);
  return UTF8_DECODER.decode(leaderBytes);
}

/**
 * Validate the leader and add warnings if needed.
 */
function validateLeader(leader: string, warnings: MarcWarning[], strict: boolean): boolean {
  if (leader.length !== LEADER_LENGTH) {
    const warning = createWarning(
      'invalid_leader',
      `Leader length is ${leader.length}, expected ${LEADER_LENGTH}`
    );
    if (strict) throw new Error(warning.message);
    warnings.push(warning);
    return false;
  }

  // Check indicator count (position 10) should be '2'
  if (leader[10] !== '2') {
    const warning = createWarning(
      'invalid_leader',
      `Leader position 10 (indicator count) is '${leader[10]}', expected '2'`
    );
    // This is a warning but not fatal, continue parsing
    warnings.push(warning);
  }

  // Check subfield code length (position 11) should be '2'
  if (leader[11] !== '2') {
    const warning = createWarning(
      'invalid_leader',
      `Leader position 11 (subfield code length) is '${leader[11]}', expected '2'`
    );
    // This is a warning but not fatal, continue parsing
    warnings.push(warning);
  }

  return true;
}

/**
 * Parse the directory section into entries.
 */
function parseDirectory(
  directoryBytes: Uint8Array,
  warnings: MarcWarning[],
  strict: boolean,
  maxWarnings: number
): DirectoryEntry[] {
  const entries: DirectoryEntry[] = [];

  for (let i = 0; i < directoryBytes.length; i += DIRECTORY_ENTRY_LENGTH) {
    if (warnings.length >= maxWarnings) {
      warnings.push(
        createWarning(
          'truncated_record',
          `Directory parsing halted after reaching maxWarnings limit (${maxWarnings}); ` +
            `remaining ${directoryBytes.length - i} bytes of directory not parsed.`
        )
      );
      break;
    }

    if (i + DIRECTORY_ENTRY_LENGTH > directoryBytes.length) {
      // Partial entry, skip
      break;
    }

    const entryBytes = directoryBytes.slice(i, i + DIRECTORY_ENTRY_LENGTH);
    const entryStr = UTF8_DECODER.decode(entryBytes);

    const tag = entryStr.substring(0, TAG_LENGTH);
    const fieldLengthStr = entryStr.substring(TAG_LENGTH, TAG_LENGTH + FIELD_LENGTH_SIZE);
    const startingPositionStr = entryStr.substring(
      TAG_LENGTH + FIELD_LENGTH_SIZE,
      DIRECTORY_ENTRY_LENGTH
    );

    const fieldLength = parseInt(fieldLengthStr, 10);
    const startingPosition = parseInt(startingPositionStr, 10);

    if (isNaN(fieldLength) || isNaN(startingPosition)) {
      const warning = createWarning(
        'invalid_directory',
        `Invalid directory entry for tag ${tag}: length=${fieldLengthStr}, position=${startingPositionStr}`
      );
      if (strict) throw new Error(warning.message);
      warnings.push(warning);
      continue;
    }

    entries.push({ tag, fieldLength, startingPosition });
  }

  return entries;
}

/**
 * Parse all fields using directory entries.
 */
function parseFields(
  buffer: Uint8Array,
  directoryEntries: DirectoryEntry[],
  baseAddress: number,
  decodeBytes: (b: Uint8Array) => string,
  warnings: MarcWarning[],
  strict: boolean,
  maxWarnings: number
): (ControlField | DataField)[] {
  const fields: (ControlField | DataField)[] = [];

  for (const entry of directoryEntries) {
    if (warnings.length >= maxWarnings) {
      warnings.push(
        createWarning(
          'truncated_record',
          `Field parsing halted after reaching maxWarnings limit (${maxWarnings}); ` +
            `not all directory entries were processed.`,
          undefined,
          entry.tag
        )
      );
      break;
    }

    const start = baseAddress + entry.startingPosition;
    const end = start + entry.fieldLength - 1; // -1 for field terminator

    // Bounds check
    if (start >= buffer.length || end > buffer.length) {
      const warning = createWarning(
        'invalid_field',
        `Field ${entry.tag} out of bounds: start=${start}, end=${end}, buffer length=${buffer.length}`,
        start,
        entry.tag
      );
      if (strict) throw new Error(warning.message);
      warnings.push(warning);
      continue;
    }

    // Verify the byte at `end` is actually the field terminator. If it isn't,
    // the directory's fieldLength was off or the record is malformed — emit a
    // warning and use the full declared span so we don't silently drop the
    // last real byte of data.
    let fieldBytes: Uint8Array;
    if (buffer[end] !== FIELD_TERMINATOR) {
      const warning = createWarning(
        'invalid_field',
        `Field ${entry.tag} does not end with a field terminator at byte ${end} ` +
          `(found 0x${(buffer[end] ?? 0).toString(16).padStart(2, '0')}); ` +
          `using the full declared length without stripping a terminator byte.`,
        start,
        entry.tag
      );
      if (strict) throw new Error(warning.message);
      warnings.push(warning);
      fieldBytes = buffer.slice(start, start + entry.fieldLength);
    } else {
      fieldBytes = buffer.slice(start, end);
    }

    // Control field (00X): no indicators, just data
    if (entry.tag.startsWith('00')) {
      try {
        const data = decodeBytes(fieldBytes);
        fields.push({ tag: entry.tag, data });
      } catch (error) {
        const warning = createWarning(
          'encoding_error',
          `Failed to decode control field ${entry.tag}: ` +
            `${error instanceof Error ? error.message : String(error)}. ` +
            `Raw bytes (hex): ${bytesPreview(fieldBytes)}.`,
          start,
          entry.tag
        );
        if (strict) throw new Error(warning.message);
        warnings.push(warning);
        // Preserve the field shape with a best-effort decode so callers retain
        // the record's structure rather than losing the field entirely.
        fields.push({ tag: entry.tag, data: bestEffortDecode(fieldBytes) });
      }
      continue;
    }

    // Data field (01X-9XX): indicators + subfields
    if (fieldBytes.length < 2) {
      const warning = createWarning(
        'invalid_field',
        `Data field ${entry.tag} too short for indicators: ${fieldBytes.length} bytes`,
        start,
        entry.tag
      );
      if (strict) throw new Error(warning.message);
      warnings.push(warning);
      continue;
    }

    try {
      const indicator1 = String.fromCharCode(fieldBytes[0] ?? 0);
      const indicator2 = String.fromCharCode(fieldBytes[1] ?? 0);
      const subfieldBytes = fieldBytes.slice(2); // Skip 2 indicator bytes

      const subfields = parseSubfields(
        subfieldBytes,
        decodeBytes,
        entry.tag,
        warnings,
        strict,
        maxWarnings
      );

      fields.push({
        tag: entry.tag,
        indicator1,
        indicator2,
        subfields,
      });
    } catch (error) {
      const warning = createWarning(
        'invalid_field',
        `Failed to parse data field ${entry.tag}: ${error instanceof Error ? error.message : String(error)}`,
        start,
        entry.tag
      );
      if (strict) throw new Error(warning.message);
      warnings.push(warning);
    }
  }

  return fields;
}

/**
 * Parse subfields from a data field.
 */
function parseSubfields(
  subfieldBytes: Uint8Array,
  decodeBytes: (b: Uint8Array) => string,
  tag: string,
  warnings: MarcWarning[],
  strict: boolean,
  maxWarnings: number
): Subfield[] {
  const subfields: Subfield[] = [];
  let i = 0;

  while (i < subfieldBytes.length) {
    if (warnings.length >= maxWarnings) {
      warnings.push(
        createWarning(
          'truncated_record',
          `Subfield parsing halted after reaching maxWarnings limit (${maxWarnings}) ` +
            `in field ${tag}; not all subfields were processed.`,
          undefined,
          tag
        )
      );
      break;
    }

    // Expect SUBFIELD_DELIMITER
    if (subfieldBytes[i] !== SUBFIELD_DELIMITER) {
      const warning = createWarning(
        'invalid_field',
        `Expected subfield delimiter in field ${tag} at position ${i}`,
        undefined,
        tag
      );
      if (strict) throw new Error(warning.message);
      warnings.push(warning);
      break;
    }

    i++; // Skip delimiter

    if (i >= subfieldBytes.length) break;

    // Next byte is subfield code
    const code = String.fromCharCode(subfieldBytes[i] ?? 0);
    i++;

    // Value extends until next delimiter or end
    const valueStart = i;
    while (i < subfieldBytes.length && subfieldBytes[i] !== SUBFIELD_DELIMITER) {
      i++;
    }

    const valueBytes = subfieldBytes.slice(valueStart, i);
    try {
      const value = decodeBytes(valueBytes);
      subfields.push({ code, value });
    } catch (error) {
      const warning = createWarning(
        'encoding_error',
        `Failed to decode subfield ${tag}$${code}: ` +
          `${error instanceof Error ? error.message : String(error)}. ` +
          `Raw bytes (hex): ${bytesPreview(valueBytes)}.`,
        undefined,
        tag
      );
      if (strict) throw new Error(warning.message);
      warnings.push(warning);
      // Preserve the subfield shape so callers don't lose data structure.
      subfields.push({ code, value: bestEffortDecode(valueBytes) });
    }
  }

  return subfields;
}

/**
 * Create a warning object.
 */
function createWarning(
  type: MarcWarningType,
  message: string,
  position?: number,
  tag?: string
): MarcWarning {
  return { type, message, position, tag };
}
