/**
 * ISO2709 binary format serializer for MARC21 records.
 * Converts MarcRecord objects back to binary format.
 */

import type { MarcRecord, ControlField, DataField } from './types';
import { isControlField } from './types';
import { unicodeToMarc8 } from './marc8';

/**
 * Options for serializing MARC records.
 */
export interface SerializeOptions {
  /**
   * Character encoding to use for field content.
   * - 'utf8' (default): UTF-8; sets leader byte 9 to 'a'.
   * - 'marc8': MARC8 (ANSEL); sets leader byte 9 to ' ' (space).
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

/**
 * Serialize a MARC record to ISO2709 binary format.
 *
 * @param record - The MARC record to serialize
 * @returns Binary representation of the record (Uint8Array for browser compatibility)
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
 *
 * const buffer = serializeMarcRecord(record);
 * // Can now be written to file or transmitted
 * ```
 */
export function serializeMarcRecord(record: MarcRecord, options: SerializeOptions = {}): Uint8Array {
  const useMarc8 = options.encoding === 'marc8';
  const encoder = new TextEncoder();
  const encodeText: (s: string) => Uint8Array = useMarc8
    ? unicodeToMarc8
    : (s) => encoder.encode(s);

  // Build directory and data sections
  const directoryEntries: string[] = [];
  const dataSegments: Uint8Array[] = [];
  let dataPosition = 0;

  for (const field of record.fields) {
    const fieldData = serializeField(field, encodeText);
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
  const result = new Uint8Array(recordLength);
  result.set(encoder.encode(leader), 0);
  result.set(directoryWithTerminator, LEADER_LENGTH);
  result.set(data, baseAddress);
  result[recordLength - 1] = RECORD_TERMINATOR;

  return result;
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

  // Data field: indicators (always ASCII) + subfields
  const indicatorBytes = new Uint8Array([
    field.indicator1.charCodeAt(0) || 0x20,
    field.indicator2.charCodeAt(0) || 0x20,
  ]);

  const subfieldParts: Uint8Array[] = [indicatorBytes];
  for (const subfield of field.subfields) {
    const delimAndCode = new Uint8Array([SUBFIELD_DELIMITER, subfield.code.charCodeAt(0)!]);
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
