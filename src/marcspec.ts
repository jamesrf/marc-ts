/**
 * MARCspec querying for MARC records.
 * Implements the field/subfield addressing subset of the MARCspec standard
 * (https://marcspec.github.io/MARCspec/): tags, subfield codes and ranges,
 * character ranges, field/subfield occurrence indices, and indicators.
 *
 * Comparison/predicate subspecs (e.g. `020$c{?020$a}`) are not supported —
 * parsing such a spec throws a MarcSpecParseError.
 */

import type { MarcRecord } from './types';
import { isControlField, isDataField } from './types';

/** A resolved position or "last" (`#`) marker, prior to record-relative resolution. */
type Position = number | '#';

interface PositionRange {
  readonly start: Position;
  readonly end: Position;
}

interface FieldSpecAst {
  readonly tag: string; // 3 chars; '.' is a wildcard digit
  readonly fieldIndex?: PositionRange;
  readonly subfieldCodes?: readonly string[]; // single codes, e.g. ['a', 'b']
  readonly subfieldRange?: { readonly from: string; readonly to: string };
  readonly subfieldIndex?: PositionRange;
  readonly charRange?: PositionRange;
  readonly indicator?: '1' | '2';
}

export type MarcSpecAst = FieldSpecAst;

export class MarcSpecParseError extends Error {
  readonly spec: string;
  readonly position: number;

  constructor(message: string, spec: string, position: number) {
    super(`${message} (at position ${position} in "${spec}")`);
    this.name = 'MarcSpecParseError';
    this.spec = spec;
    this.position = position;
  }
}

export interface MarcSpecMatch {
  readonly tag: string;
  readonly occurrence: number; // 0-based
  readonly subfieldCode?: string;
  readonly value: string;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

class Cursor {
  readonly spec: string;
  pos = 0;

  constructor(spec: string) {
    this.spec = spec;
  }

  peek(): string | undefined {
    return this.spec[this.pos];
  }

  eof(): boolean {
    return this.pos >= this.spec.length;
  }

  error(message: string): never {
    throw new MarcSpecParseError(message, this.spec, this.pos);
  }
}

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= '0' && ch <= '9';
}

function isAlphaLower(ch: string | undefined): boolean {
  return ch !== undefined && ch >= 'a' && ch <= 'z';
}

function isAlphaUpper(ch: string | undefined): boolean {
  return ch !== undefined && ch >= 'A' && ch <= 'Z';
}

function parsePosition(cursor: Cursor): Position {
  if (cursor.peek() === '#') {
    cursor.pos++;
    return '#';
  }
  const start = cursor.pos;
  while (isDigit(cursor.peek())) cursor.pos++;
  if (cursor.pos === start) {
    cursor.error('Expected a position (digit or "#")');
  }
  return Number(cursor.spec.slice(start, cursor.pos));
}

function parsePositionOrRange(cursor: Cursor): PositionRange {
  const first = parsePosition(cursor);
  if (cursor.peek() === '-') {
    cursor.pos++;
    const second = parsePosition(cursor);
    return { start: first, end: second };
  }
  return { start: first, end: first };
}

function parseIndex(cursor: Cursor): PositionRange {
  // Assumes leading '[' already confirmed by caller.
  cursor.pos++; // consume '['
  const range = parsePositionOrRange(cursor);
  if (cursor.peek() !== ']') {
    cursor.error('Expected "]" to close index');
  }
  cursor.pos++; // consume ']'
  return range;
}

function parseCharSpec(cursor: Cursor): PositionRange {
  // Assumes leading '/' already confirmed by caller.
  cursor.pos++; // consume '/'
  return parsePositionOrRange(cursor);
}

function parseTag(cursor: Cursor): string {
  const start = cursor.pos;
  let chars = '';
  for (let i = 0; i < 3; i++) {
    const ch = cursor.peek();
    if (ch === '.' || isDigit(ch) || isAlphaLower(ch) || isAlphaUpper(ch)) {
      chars += ch;
      cursor.pos++;
    } else {
      cursor.pos = start;
      cursor.error('Expected a 3-character field tag');
    }
  }
  return chars;
}

function parseSubfieldPart(cursor: Cursor): Pick<FieldSpecAst, 'subfieldCodes' | 'subfieldRange'> {
  // Assumes leading '$' already confirmed by caller.
  cursor.pos++; // consume '$'
  const first = cursor.peek();
  if (first === undefined) {
    cursor.error('Expected a subfield code after "$"');
  }
  cursor.pos++;

  // Range: $a-c (only plain alpha/digit pairs, not followed by another '$')
  if (cursor.peek() === '-' && cursor.spec[cursor.pos + 1] !== undefined) {
    const isAlphaPair = isAlphaLower(first) && isAlphaLower(cursor.spec[cursor.pos + 1]);
    const isDigitPair = isDigit(first) && isDigit(cursor.spec[cursor.pos + 1]);
    if (isAlphaPair || isDigitPair) {
      cursor.pos++; // consume '-'
      const to = cursor.spec[cursor.pos];
      cursor.pos++;
      return { subfieldRange: { from: first as string, to: to as string } };
    }
  }

  const codes = [first as string];
  while (cursor.peek() === '$') {
    cursor.pos++;
    const code = cursor.peek();
    if (code === undefined) {
      cursor.error('Expected a subfield code after "$"');
    }
    codes.push(code as string);
    cursor.pos++;
  }
  return { subfieldCodes: codes };
}

/**
 * Parse a MARCspec addressing string into an AST.
 * Supports field tags, subfield codes/ranges, character ranges, field/subfield
 * occurrence indices, and indicators. Throws MarcSpecParseError for malformed
 * specs or for unsupported constructs (comparison subspecs in `{...}`).
 */
export function parseMarcSpec(spec: string): MarcSpecAst {
  const cursor = new Cursor(spec);
  if (spec.length === 0) {
    cursor.error('MARCspec string must not be empty');
  }

  const tag = parseTag(cursor);

  let fieldIndex: PositionRange | undefined;
  if (cursor.peek() === '[') {
    fieldIndex = parseIndex(cursor);
  }

  let subfieldCodes: readonly string[] | undefined;
  let subfieldRange: { from: string; to: string } | undefined;
  let subfieldIndex: PositionRange | undefined;
  let indicator: '1' | '2' | undefined;

  if (cursor.peek() === '$') {
    const parsed = parseSubfieldPart(cursor);
    subfieldCodes = parsed.subfieldCodes;
    subfieldRange = parsed.subfieldRange;

    if (cursor.peek() === '[') {
      subfieldIndex = parseIndex(cursor);
    }
  } else if (cursor.peek() === '^') {
    cursor.pos++;
    const ch = cursor.peek();
    if (ch !== '1' && ch !== '2') {
      cursor.error('Indicator must be "1" or "2"');
    }
    indicator = ch as '1' | '2';
    cursor.pos++;
  }

  let charRange: PositionRange | undefined;
  if (cursor.peek() === '/') {
    charRange = parseCharSpec(cursor);
  }

  if (cursor.peek() === '{') {
    cursor.error('Comparison subspecs ("{...}") are not supported');
  }

  if (!cursor.eof()) {
    cursor.error(`Unexpected character "${cursor.peek()}"`);
  }

  return {
    tag,
    fieldIndex,
    subfieldCodes,
    subfieldRange,
    subfieldIndex,
    charRange,
    indicator,
  };
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

function matchesTag(tag: string, pattern: string): boolean {
  for (let i = 0; i < 3; i++) {
    const p = pattern[i];
    if (p === '.') continue;
    if (p !== tag[i]) return false;
  }
  return true;
}

function resolvePosition(position: Position, length: number): number {
  return position === '#' ? length - 1 : position;
}

/** Select items from an array by a 0-based index/range, honoring "#" as last. */
function selectByRange<T>(items: readonly T[], range: PositionRange | undefined): T[] {
  if (range === undefined) return [...items];
  const start = resolvePosition(range.start, items.length);
  const end = resolvePosition(range.end, items.length);
  const [lo, hi] = start <= end ? [start, end] : [end, start];
  return items.slice(Math.max(lo, 0), hi + 1);
}

/** Slice a string by a 0-based character index/range, honoring "#" as last. */
function sliceByRange(value: string, range: PositionRange | undefined): string {
  if (range === undefined) return value;
  const start = resolvePosition(range.start, value.length);
  const end = resolvePosition(range.end, value.length);
  const [lo, hi] = start <= end ? [start, end] : [end, start];
  return value.slice(Math.max(lo, 0), hi + 1);
}

function resolveSubfieldCodes(ast: FieldSpecAst): readonly string[] | undefined {
  if (ast.subfieldCodes) return ast.subfieldCodes;
  if (ast.subfieldRange) {
    const { from, to } = ast.subfieldRange;
    const codes: string[] = [];
    for (let c = from.charCodeAt(0); c <= to.charCodeAt(0); c++) {
      codes.push(String.fromCharCode(c));
    }
    return codes;
  }
  return undefined;
}

/**
 * Resolve a MARCspec addressing string against a record.
 * Returns an empty array if the spec is syntactically valid but matches
 * nothing in the given record. Throws MarcSpecParseError for malformed or
 * unsupported spec strings.
 */
export function getBySpec(record: MarcRecord, spec: string): MarcSpecMatch[] {
  const ast = parseMarcSpec(spec);

  // LDR is not a member of record.fields; handle it as a synthetic single field.
  if (ast.tag === 'LDR') {
    return [
      {
        tag: 'LDR',
        occurrence: 0,
        value: sliceByRange(record.leader, ast.charRange),
      },
    ];
  }

  const allMatchingFields = record.fields
    .map((field, index) => ({ field, index }))
    .filter(({ field }) => matchesTag(field.tag, ast.tag));

  const selectedFields = selectByRange(allMatchingFields, ast.fieldIndex);

  const matches: MarcSpecMatch[] = [];

  for (const { field, index: occurrence } of selectedFields) {
    if (ast.indicator !== undefined) {
      if (!isDataField(field)) continue;
      const value = ast.indicator === '1' ? field.indicator1 : field.indicator2;
      matches.push({
        tag: field.tag,
        occurrence,
        value: sliceByRange(value, ast.charRange),
      });
      continue;
    }

    const subfieldCodes = resolveSubfieldCodes(ast);
    if (subfieldCodes !== undefined) {
      if (!isDataField(field)) continue;
      // Apply the occurrence index ([n]) per code (e.g. "second $x"), then
      // flatten back into document order so a code range ($x-y) reads out
      // in the order subfields actually appear in the field.
      const selectedByCode = new Set<number>();
      for (const code of subfieldCodes) {
        const matchingSubfields = field.subfields
          .map((sf, sfIndex) => ({ sf, sfIndex }))
          .filter(({ sf }) => sf.code === code);
        for (const { sfIndex } of selectByRange(matchingSubfields, ast.subfieldIndex)) {
          selectedByCode.add(sfIndex);
        }
      }
      field.subfields.forEach((sf, sfIndex) => {
        if (!selectedByCode.has(sfIndex)) return;
        matches.push({
          tag: field.tag,
          occurrence,
          subfieldCode: sf.code,
          value: sliceByRange(sf.value, ast.charRange),
        });
      });
      continue;
    }

    if (!isControlField(field)) continue;
    matches.push({
      tag: field.tag,
      occurrence,
      value: sliceByRange(field.data, ast.charRange),
    });
  }

  return matches;
}

/**
 * Resolve a MARCspec addressing string against a record and return only the
 * matched values, discarding tag/occurrence/subfield metadata.
 */
export function getValuesBySpec(record: MarcRecord, spec: string): string[] {
  return getBySpec(record, spec).map((match) => match.value);
}
