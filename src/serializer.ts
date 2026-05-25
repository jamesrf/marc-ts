/**
 * ISO2709 binary format serializer for MARC21 records.
 * Converts MarcRecord objects back to binary format.
 */

import type { MarcRecord, ControlField, DataField, MarcWarning } from './types';
import { isControlField } from './types';
import { unicodeToMarc8WithStats } from './marc8';
import { createWarning } from './warnings';

/**
 * Options for serializing MARC records.
 */
export interface SerializeOptions {
  /**
   * Character encoding to use for field content.
   * - 'utf8' (default): UTF-8; sets leader byte 9 to 'a'.
   * - 'marc8': conservative MARC-8/ANSEL output; sets leader byte 9 to ' ' (space).
   *   Broad MARC-8 script decoding is supported by the parser, but encoding is limited
   *   to ASCII plus ANSEL Latin/combining characters.
   */
  readonly encoding?: 'utf8' | 'marc8';
}

// ISO2709 separator characters
const SUBFIELD_DELIMITER = 0x1f; // ASCII 31 (IS1 - Unit Separator)
const FIELD_TERMINATOR = 0x1e; // ASCII 30 (IS2 - Information Separator)
const RECORD_TERMINATOR = 0x1d; // ASCII 29 (IS3 - Group Separator)

// Leader constants
const LEADER_LENGTH = 24;
const TAG_LENGTH = 3;
const FIELD_LENGTH_SIZE = 4;
const STARTING_POSITION_SIZE = 5;

function serializeMarcRecord(
  record: MarcRecord,
  options: SerializeOptions = {}
): Uint8Array {
  return serializeMarcRecordWithWarnings(record, options).bytes;
}

interface SerializeResult {
  readonly bytes: Uint8Array;
  readonly warnings: readonly MarcWarning[];
}

function serializeMarcRecordWithWarnings(
  record: MarcRecord,
  options: SerializeOptions = {}
): SerializeResult {
  validateRecord(record);
  const warnings: MarcWarning[] = [];

  const useMarc8 = options.encoding === 'marc8';
  const encoder = new TextEncoder();
  const encodeText: (s: string, tag?: string) => Uint8Array = useMarc8
    ? (s, tag) => {
        const result = unicodeToMarc8WithStats(s);
        if (result.lossyCount > 0) {
          warnings.push(
            createWarning(
              'encoding_error',
              `MARC-8 encoding substituted ${result.lossyCount} character(s) with '?' ` +
                `because they have no MARC-8 equivalent.`,
              undefined,
              tag
            )
          );
        }
        return result.bytes;
      }
    : (s) => encoder.encode(s);

  // Build directory and data sections
  const directoryEntries: string[] = [];
  const dataSegments: Uint8Array[] = [];
  let dataPosition = 0;

  for (const field of record.fields) {
    const fieldData = serializeField(field, (s) => encodeText(s, field.tag));
    const fieldLength = fieldData.length + 1; // +1 for field terminator

    // Directory entry: tag (3) + length (4) + position (5) = 12 bytes
    const entry =
      field.tag.padEnd(TAG_LENGTH, ' ') +
      fieldLength.toString().padStart(FIELD_LENGTH_SIZE, '0') +
      dataPosition.toString().padStart(STARTING_POSITION_SIZE, '0');

    directoryEntries.push(entry);
    dataSegments.push(fieldData);
    dataSegments.push(new Uint8Array([FIELD_TERMINATOR]));

    dataPosition += fieldLength;
  }

  // Build directory
  const directory = encoder.encode(directoryEntries.join(''));
  const directoryWithTerminator = new Uint8Array(directory.length + 1);
  directoryWithTerminator.set(directory);
  directoryWithTerminator[directory.length] = FIELD_TERMINATOR;

  // Calculate base address: leader (24) + directory + terminator
  const baseAddress = LEADER_LENGTH + directoryWithTerminator.length;

  // Build data section
  const totalDataLength = dataSegments.reduce((sum, seg) => sum + seg.length, 0);
  const data = new Uint8Array(totalDataLength);
  let offset = 0;
  for (const segment of dataSegments) {
    data.set(segment, offset);
    offset += segment.length;
  }

  // Build leader with calculated values
  const recordLength = baseAddress + totalDataLength + 1; // +1 for record terminator
  const leader = buildLeader(record.leader, recordLength, baseAddress, useMarc8);

  // Assemble final record
  const bytes = new Uint8Array(recordLength);
  bytes.set(encoder.encode(leader), 0);
  bytes.set(directoryWithTerminator, LEADER_LENGTH);
  bytes.set(data, baseAddress);
  bytes[recordLength - 1] = RECORD_TERMINATOR;

  return { bytes, warnings };
}

function isAsciiPrintable(s: string): boolean {
  const c = s.charCodeAt(0);
  return c >= 0x20 && c <= 0x7e;
}

/**
 * Validate a record at the serializer boundary. Throws on any input that would
 * produce silently-corrupted bytes (e.g. an empty subfield code that would
 * serialize to a 0x00 byte and round-trip back as a space, or a non-ASCII
 * character whose code point > 0xFF would be truncated when stored in a Uint8Array).
 */
function validateRecord(record: MarcRecord): void {
  for (const field of record.fields) {
    if (typeof field.tag !== 'string' || field.tag.length !== 3) {
      throw new Error(
        `MARC field tag must be exactly 3 characters; got ${JSON.stringify(field.tag)}`
      );
    }

    if (isControlField(field)) {
      continue;
    }

    if (field.indicator1.length !== 1) {
      throw new Error(
        `Field ${field.tag} indicator1 must be exactly 1 character; got ${JSON.stringify(field.indicator1)}`
      );
    }
    if (!isAsciiPrintable(field.indicator1)) {
      throw new Error(
        `Field ${field.tag} indicator1 must be an ASCII printable character (U+0020–U+007E); got ${JSON.stringify(field.indicator1)}`
      );
    }
    if (field.indicator2.length !== 1) {
      throw new Error(
        `Field ${field.tag} indicator2 must be exactly 1 character; got ${JSON.stringify(field.indicator2)}`
      );
    }
    if (!isAsciiPrintable(field.indicator2)) {
      throw new Error(
        `Field ${field.tag} indicator2 must be an ASCII printable character (U+0020–U+007E); got ${JSON.stringify(field.indicator2)}`
      );
    }
    for (const sf of field.subfields) {
      if (sf.code.length !== 1) {
        throw new Error(
          `Field ${field.tag} subfield code must be exactly 1 character; got ${JSON.stringify(sf.code)}`
        );
      }
      if (!isAsciiPrintable(sf.code)) {
        throw new Error(
          `Field ${field.tag} subfield code must be an ASCII printable character (U+0020–U+007E); got ${JSON.stringify(sf.code)}`
        );
      }
    }
  }
}

/**
 * Serialize a single field (control or data) to bytes.
 */
function serializeField(
  field: ControlField | DataField,
  encodeText: (s: string) => Uint8Array
): Uint8Array {
  if (isControlField(field)) {
    return encodeText(field.data);
  }

  // Data field: indicators (always ASCII) + subfields.
  // validateRecord guarantees indicators and subfield codes are exactly 1 char,
  // so no fallback substitution is needed here.
  const indicatorBytes = new Uint8Array([
    field.indicator1.charCodeAt(0),
    field.indicator2.charCodeAt(0),
  ]);

  const subfieldParts: Uint8Array[] = [indicatorBytes];
  for (const subfield of field.subfields) {
    const delimAndCode = new Uint8Array([SUBFIELD_DELIMITER, subfield.code.charCodeAt(0)]);
    subfieldParts.push(delimAndCode, encodeText(subfield.value));
  }

  const totalLen = subfieldParts.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(totalLen);
  let off = 0;
  for (const part of subfieldParts) {
    out.set(part, off);
    off += part.length;
  }
  return out;
}

/**
 * Build a leader string with updated record length and base address.
 *
 * @param originalLeader - The original leader (24 characters)
 * @param recordLength - The calculated total record length
 * @param baseAddress - The calculated base address of data
 * @returns Updated leader (24 characters)
 */
function buildLeader(
  originalLeader: string,
  recordLength: number,
  baseAddress: number,
  useMarc8: boolean
): string {
  // Ensure original leader is 24 characters
  let leader = originalLeader.padEnd(LEADER_LENGTH, ' ').substring(0, LEADER_LENGTH);

  // Update record length (positions 00-04)
  const recordLengthStr = recordLength.toString().padStart(5, '0');
  if (recordLengthStr.length > 5) {
    throw new Error(`Record length ${recordLength} exceeds maximum (99999)`);
  }
  leader = recordLengthStr + leader.substring(5);

  // Update base address (positions 12-16)
  const baseAddressStr = baseAddress.toString().padStart(5, '0');
  if (baseAddressStr.length > 5) {
    throw new Error(`Base address ${baseAddress} exceeds maximum (99999)`);
  }
  leader = leader.substring(0, 12) + baseAddressStr + leader.substring(17);

  // Update leader byte 9 (character encoding scheme): ' ' = MARC8, 'a' = UTF-8
  leader = leader.substring(0, 9) + (useMarc8 ? ' ' : 'a') + leader.substring(10);

  return leader;
}

/**
 * Serialize an array of MARC records to a concatenated ISO2709 binary stream.
 *
 * Each record is individually serialized (with its own 0x1D terminator) and
 * the results are concatenated into a single Uint8Array.
 *
 * @param records - MARC records to serialize
 * @param options - Encoding options forwarded to the per-record serializer
 * @returns Concatenated binary representation of all records
 */
export function serializeMarcBinary(records: MarcRecord[], options: SerializeOptions = {}): Uint8Array {
  const parts = records.map((r) => serializeMarcRecord(r, options));
  const totalLength = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
