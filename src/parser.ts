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
  MarcWarning,
  MarcWarningType,
} from './types';

// ISO2709 separator characters
const SUBFIELD_DELIMITER = 0x1f; // ASCII 31 (IS1 - Unit Separator)
const FIELD_TERMINATOR = 0x1e; // ASCII 30 (IS2 - Information Separator)

// Leader constants
const LEADER_LENGTH = 24;
const DIRECTORY_ENTRY_LENGTH = 12;
const TAG_LENGTH = 3;
const FIELD_LENGTH_SIZE = 4;

/**
 * Internal representation of a directory entry.
 */
interface DirectoryEntry {
  tag: string;
  fieldLength: number;
  startingPosition: number;
}

/**
 * Parse a MARC21 record from ISO2709 binary format.
 *
 * @param buffer - The binary data to parse (use Uint8Array for browser compatibility)
 * @param options - Parsing options (strict mode, max warnings)
 * @returns Parse result containing the record and any warnings
 *
 * @example
 * ```typescript
 * const buffer = new Uint8Array([...]); // MARC21 binary data
 * const result = parseMarcRecord(buffer);
 *
 * if (result.record) {
 *   console.log('Parsed successfully');
 * }
 *
 * if (result.warnings.length > 0) {
 *   console.warn('Warnings:', result.warnings);
 * }
 * ```
 */
export function parseMarcRecord(buffer: Uint8Array, options: ParseOptions = {}): ParseResult {
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

  // Parse fields using directory entries
  const fields = parseFields(buffer, directoryEntries, baseAddress, warnings, strict, maxWarnings);

  return {
    record: { leader, fields },
    warnings,
  };
}

/**
 * Convenience wrapper for strict parsing.
 * Throws an error if parsing fails.
 *
 * @param buffer - The binary data to parse
 * @returns The parsed MARC record
 * @throws Error if parsing fails
 *
 * @example
 * ```typescript
 * try {
 *   const record = parseMarcRecordStrict(buffer);
 *   console.log('Title:', title(record));
 * } catch (error) {
 *   console.error('Parsing failed:', error);
 * }
 * ```
 */
export function parseMarcRecordStrict(buffer: Uint8Array): MarcRecord {
  const result = parseMarcRecord(buffer, { strict: true });
  if (!result.record) {
    throw new Error('Failed to parse MARC record in strict mode');
  }
  return result.record;
}

/**
 * Decode the leader from the buffer.
 */
function decodeLeader(buffer: Uint8Array): string {
  const leaderBytes = buffer.slice(0, LEADER_LENGTH);
  const decoder = new TextDecoder('utf-8', { fatal: false });
  return decoder.decode(leaderBytes);
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
  const decoder = new TextDecoder('utf-8', { fatal: false }); // Directory is ASCII

  for (let i = 0; i < directoryBytes.length; i += DIRECTORY_ENTRY_LENGTH) {
    if (warnings.length >= maxWarnings) break;

    if (i + DIRECTORY_ENTRY_LENGTH > directoryBytes.length) {
      // Partial entry, skip
      break;
    }

    const entryBytes = directoryBytes.slice(i, i + DIRECTORY_ENTRY_LENGTH);
    const entryStr = decoder.decode(entryBytes);

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
  warnings: MarcWarning[],
  strict: boolean,
  maxWarnings: number
): (ControlField | DataField)[] {
  const fields: (ControlField | DataField)[] = [];
  const decoder = new TextDecoder('utf-8', { fatal: false });

  for (const entry of directoryEntries) {
    if (warnings.length >= maxWarnings) break;

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

    const fieldBytes = buffer.slice(start, end);

    // Control field (00X): no indicators, just data
    if (entry.tag.startsWith('00')) {
      try {
        const data = decoder.decode(fieldBytes);
        fields.push({ tag: entry.tag, data });
      } catch (error) {
        const warning = createWarning(
          'encoding_error',
          `Failed to decode control field ${entry.tag}: ${error instanceof Error ? error.message : String(error)}`,
          start,
          entry.tag
        );
        if (strict) throw new Error(warning.message);
        warnings.push(warning);
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
        decoder,
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
  decoder: TextDecoder,
  tag: string,
  warnings: MarcWarning[],
  strict: boolean,
  maxWarnings: number
): Subfield[] {
  const subfields: Subfield[] = [];
  let i = 0;

  while (i < subfieldBytes.length) {
    if (warnings.length >= maxWarnings) break;

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

    try {
      const valueBytes = subfieldBytes.slice(valueStart, i);
      const value = decoder.decode(valueBytes);
      subfields.push({ code, value });
    } catch (error) {
      const warning = createWarning(
        'encoding_error',
        `Failed to decode subfield ${tag}$${code}: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        tag
      );
      if (strict) throw new Error(warning.message);
      warnings.push(warning);
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
