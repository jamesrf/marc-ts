/**
 * MARCBreaker (marctxt) parser and serializer.
 *
 * Also known as MARCMaker format. Each field is one line:
 *
 *   =LDR  00706cam a2200217 a 4500
 *   =001  5490
 *   =245  14$aThe Hobbit /$cJ.R.R. Tolkien.
 *   =650  \1$aHobbits (Fictitious characters)$vFiction.
 *
 * Blank indicators are represented as `\`. Records are separated by blank lines.
 * Subfield delimiter is `$` followed by a single character code.
 *
 * Curly-brace escape sequences (per LC MARCMaker spec):
 *   `{`  → `{lcub}`   (left curly brace; reserved by the format)
 *   `}`  → `{rcub}`   (right curly brace; reserved by the format)
 *   `$`  → `{dollar}` (subfield delimiter)
 *   `\`  → `{bsol}`   (backslash; reserved as blank-indicator stand-in)
 *
 */

import type { MarcRecord, ControlField, DataField, Subfield } from './types';
import { isControlField } from './types';

// ─── Indicator encoding ───────────────────────────────────────────────────────

function encodeIndicator(ind: string): string {
  return ind === ' ' ? '\\' : ind;
}

function decodeIndicator(ch: string): string {
  return ch === '\\' ? ' ' : ch;
}

// ─── Value escape (see file header) ───────────────────────────────────────────

function escapeValue(s: string): string {
  // Single-pass replacement avoids the problem of earlier escapes being
  // re-escaped by later passes (e.g. '{' → '{lcub}' then '}' → '{lcub{rcub}').
  return s.replace(/[{}\\\n$]/g, (ch) => {
    if (ch === '{') return '{lcub}';
    if (ch === '}') return '{rcub}';
    if (ch === '$') return '{dollar}';
    if (ch === '\\') return '{bsol}';
    return ' ';
  });
}

function unescapeValue(s: string): string {
  return s.replace(/\{(lcub|rcub|dollar|bsol)\}/g, (_, name) => {
    if (name === 'lcub') return '{';
    if (name === 'rcub') return '}';
    if (name === 'dollar') return '$';
    return '\\';
  });
}

// ─── Subfield parsing ─────────────────────────────────────────────────────────

/**
 * Parse a subfield string like "$aValue$bOther" into Subfield objects.
 * Uses split with a capturing group: "$aFoo$bBar" → ["", "a", "Foo", "b", "Bar"].
 * Any character following `$` is treated as a subfield code.
 */
function parseSubfields(str: string): Subfield[] {
  const parts = str.split(/\$(.)/);
  const subfields: Subfield[] = [];
  // parts[0] is content before the first $ — should be empty for well-formed data
  for (let i = 1; i < parts.length; i += 2) {
    subfields.push({ code: parts[i]!, value: unescapeValue(parts[i + 1] ?? '') });
  }
  return subfields;
}

// ─── Record block parser ──────────────────────────────────────────────────────

/**
 * Parse a block of non-empty marctxt lines into a MarcRecord.
 * Each line has the form `=TAG  content`.
 */
function parseRecordLines(lines: string[]): MarcRecord {
  let leader = '';
  const fields: (ControlField | DataField)[] = [];

  for (const line of lines) {
    if (!line.startsWith('=')) continue;
    const tag = line.slice(1, 4);
    // positions 4-5 are the two separator spaces; content starts at 6
    const content = line.slice(6);

    if (tag === 'LDR' || tag === '000') {
      leader = content;
      continue;
    }

    if (tag < '010') {
      // Control field: content is the raw field data
      fields.push({ tag, data: unescapeValue(content) });
      continue;
    }

    // Data field: first two chars are indicators, rest are subfields
    const indicator1 = decodeIndicator(content[0] ?? '\\');
    const indicator2 = decodeIndicator(content[1] ?? '\\');
    const subfields = parseSubfields(content.slice(2));
    fields.push({ tag, indicator1, indicator2, subfields });
  }

  return { leader, fields };
}

// ─── Public parse API ─────────────────────────────────────────────────────────

/**
 * Parse a marctxt string containing one or more records separated by blank lines.
 * Returns all records found.
 */
export function parseMarcTxt(text: string): MarcRecord[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const records: MarcRecord[] = [];
  let buffer: string[] = [];

  for (const line of lines) {
    if (line.trim() === '') {
      if (buffer.length > 0) {
        records.push(parseRecordLines(buffer));
        buffer = [];
      }
    } else {
      buffer.push(line);
    }
  }

  if (buffer.length > 0) {
    records.push(parseRecordLines(buffer));
  }

  return records;
}

// ─── Serializer ───────────────────────────────────────────────────────────────

function serializeMarcTxtRecord(record: MarcRecord): string {
  const lines: string[] = [];

  lines.push(`=LDR  ${record.leader}`);

  for (const field of record.fields) {
    if (isControlField(field)) {
      lines.push(`=${field.tag}  ${escapeValue(field.data)}`);
    } else {
      const ind1 = encodeIndicator(field.indicator1);
      const ind2 = encodeIndicator(field.indicator2);
      const subfields = field.subfields.map((sf) => `$${sf.code}${escapeValue(sf.value)}`).join('');
      lines.push(`=${field.tag}  ${ind1}${ind2}${subfields}`);
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * Serialize one or more MarcRecords into a marctxt string.
 * Records are separated by blank lines.
 */
export function serializeMarcTxt(records: MarcRecord[]): string {
  // Each record ends with '\n'; joining with '\n' produces blank lines between records.
  return records.map(serializeMarcTxtRecord).join('\n');
}
