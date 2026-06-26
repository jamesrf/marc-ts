/**
 * MARC-in-JSON parser and serializer.
 *
 * Follows the format described at https://wiki.code4lib.org/MARCJSONification
 * and used by Open Library and various REST APIs:
 *
 * {
 *   "leader": "01142cam a2200301 a 4500",
 *   "fields": [
 *     { "001": "5490" },
 *     { "245": {
 *         "subfields": [{"a": "The Hobbit"}],
 *         "ind1": "1",
 *         "ind2": "0"
 *     }}
 *   ]
 * }
 */

import type { MarcRecord, ControlField, DataField, Subfield } from './types';
import { isControlField, isDataField } from './types';

// ─── Raw JSON shape types ─────────────────────────────────────────────────────

export interface MarcJsonSubfieldEntry {
  [code: string]: string;
}

export interface MarcJsonDataFieldValue {
  subfields: MarcJsonSubfieldEntry[];
  ind1: string;
  ind2: string;
}

export type MarcJsonField =
  | { [tag: string]: string } // control field
  | { [tag: string]: MarcJsonDataFieldValue }; // data field

export interface MarcJsonObject {
  leader: string;
  fields: MarcJsonField[];
}

// ─── Parse ────────────────────────────────────────────────────────────────────

function parseMarcJsonObject(obj: MarcJsonObject): MarcRecord {
  if (typeof obj.leader !== 'string') {
    throw new Error('MARC-in-JSON: missing or non-string "leader"');
  }
  if (!Array.isArray(obj.fields)) {
    throw new Error('MARC-in-JSON: missing or non-array "fields"');
  }

  const fields: (ControlField | DataField)[] = [];

  for (const entry of obj.fields) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error('MARC-in-JSON: each field entry must be an object');
    }

    const keys = Object.keys(entry);
    if (keys.length !== 1) {
      throw new Error(
        `MARC-in-JSON: field entry must have exactly one key, got ${keys.join(', ')}`
      );
    }

    const tag = keys[0]!;
    const value = (entry as Record<string, unknown>)[tag];

    if (typeof value === 'string') {
      fields.push({ tag, data: value });
      continue;
    }

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const dv = value as MarcJsonDataFieldValue;
      if (!Array.isArray(dv.subfields)) {
        throw new Error(`MARC-in-JSON: data field "${tag}" missing "subfields" array`);
      }
      const subfields: Subfield[] = dv.subfields.map((sfEntry, idx) => {
        if (typeof sfEntry !== 'object' || sfEntry === null) {
          throw new Error(`MARC-in-JSON: subfield entry ${idx} of "${tag}" is not an object`);
        }
        const sfKeys = Object.keys(sfEntry);
        if (sfKeys.length !== 1) {
          throw new Error(
            `MARC-in-JSON: subfield entry ${idx} of "${tag}" must have exactly one key`
          );
        }
        const code = sfKeys[0]!;
        const sfValue = sfEntry[code];
        if (typeof sfValue !== 'string') {
          throw new Error(`MARC-in-JSON: subfield value for "${tag}$${code}" must be a string`);
        }
        return { code, value: sfValue };
      });

      fields.push({
        tag,
        indicator1: dv.ind1 ?? ' ',
        indicator2: dv.ind2 ?? ' ',
        subfields,
      });
      continue;
    }

    throw new Error(
      `MARC-in-JSON: field "${tag}" value must be a string (control) or object (data)`
    );
  }

  return { leader: obj.leader, fields };
}

/**
 * Parse one or more MARC-in-JSON records into an array of MarcRecords.
 *
 * Accepts:
 * - A JSON string whose top-level value is an array or a single object
 * - A `MarcJsonObject[]` array
 * - A single `MarcJsonObject` (returned as a one-element array)
 *
 * Throws on structural errors (missing `leader`, non-array `fields`,
 * unrecognised field shapes).
 */
export function parseMarcJson(json: string | MarcJsonObject | MarcJsonObject[]): MarcRecord[] {
  if (typeof json === 'string') {
    const parsed: unknown = JSON.parse(json);
    if (Array.isArray(parsed)) {
      return (parsed as MarcJsonObject[]).map(parseMarcJsonObject);
    }
    return [parseMarcJsonObject(parsed as MarcJsonObject)];
  }
  if (Array.isArray(json)) {
    return json.map(parseMarcJsonObject);
  }
  return [parseMarcJsonObject(json)];
}

// ─── Serialize ────────────────────────────────────────────────────────────────

function serializeMarcJsonObject(record: MarcRecord): MarcJsonObject {
  const fields: MarcJsonField[] = record.fields.map((field) => {
    if (isControlField(field)) {
      return { [field.tag]: field.data };
    }
    if (isDataField(field)) {
      const subfields: MarcJsonSubfieldEntry[] = field.subfields.map((sf) => ({
        [sf.code]: sf.value,
      }));
      return {
        [field.tag]: {
          subfields,
          ind1: field.indicator1,
          ind2: field.indicator2,
        },
      };
    }
    // Unreachable — isControlField/isDataField are exhaustive — but satisfies TS
    throw new Error('Unknown field type');
  });

  return { leader: record.leader, fields };
}

/**
 * Serialize an array of MarcRecords to MARC-in-JSON plain objects.
 */
export function serializeMarcJson(records: MarcRecord[]): MarcJsonObject[] {
  return records.map(serializeMarcJsonObject);
}

/**
 * Serialize an array of MarcRecords to a JSON string (a JSON array).
 */
export function serializeMarcJsonString(records: MarcRecord[]): string {
  return JSON.stringify(serializeMarcJson(records));
}
