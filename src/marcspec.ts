/**
 * MARCspec querying for MARC records.
 * Implements the field/subfield addressing subset of the MARCspec standard
 * (https://marcspec.github.io/MARCspec/): tags, subfield codes and ranges,
 * character ranges, field/subfield occurrence indices, and indicators.
 *
 * Also implements comparison/predicate subspecs (e.g. `020$c{?020$a}`):
 * operators `=`, `!=`, `~`, `!~`, `?`, `!`; literal comparison strings
 * (`\`-escaped); cross-field/cross-subfield references and tag-abbreviation
 * shorthand; OR via `|` within one subspec; and AND via adjacent `{...}{...}`
 * subspecs.
 */

import type { ControlField, DataField, MarcRecord } from './types';
import { isControlField, isDataField } from './types';

/** A resolved position or "last" (`#`) marker, prior to record-relative resolution. */
type Position = number | '#';

interface PositionRange {
  readonly start: Position;
  readonly end: Position;
}

/** One operator in a subspec comparison ({@link SubTermSet}). */
type SubSpecOperator = '=' | '!=' | '~' | '!~' | '?' | '!';

/**
 * One operand of a subTermSet: a nested field/subfield/indicator spec
 * (cross-referenced against the record; tag-abbreviations are already
 * resolved to a full tag by parse time) or a literal comparison string.
 */
type SubTerm =
  | { readonly kind: 'spec'; readonly spec: FieldSpecAst }
  | { readonly kind: 'string'; readonly value: string };

/**
 * One comparison within a subspec: `[left] operator right`, or a bare
 * `right` (operator defaults to `?`, `left` is omitted). `left` is only
 * ever `undefined` when `operator` is `?` or `!` (unary).
 */
interface SubTermSet {
  readonly left: SubTerm | undefined;
  readonly operator: SubSpecOperator;
  readonly right: SubTerm;
}

/** `{ subTermSet ( "|" subTermSet )* }` — OR'd alternatives; any true wins. */
interface SubSpec {
  readonly subTermSets: readonly SubTermSet[];
}

interface FieldSpecAst {
  readonly tag: string; // 3 chars; '.' is a wildcard digit
  readonly fieldIndex?: PositionRange;
  readonly subfieldCodes?: readonly string[]; // single codes, e.g. ['a', 'b']
  readonly subfieldRange?: { readonly from: string; readonly to: string };
  readonly subfieldIndex?: PositionRange;
  readonly charRange?: PositionRange;
  readonly indicator?: '1' | '2';
  /** Adjacent `{...}{...}` subspecs — AND'd together (all must hold). */
  readonly subSpecs?: readonly SubSpec[];
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

type FieldSelectorSuffix = Pick<
  FieldSpecAst,
  'fieldIndex' | 'subfieldCodes' | 'subfieldRange' | 'subfieldIndex' | 'charRange' | 'indicator'
>;

/**
 * Parse the shared "selector" tail that follows a field tag: an optional
 * field-occurrence index, then either subfield codes/range (with an optional
 * subfield-occurrence index) or an indicator, then an optional character
 * range. Used both for the top-level spec and for nested subspec specs.
 */
function parseFieldSelectorSuffix(cursor: Cursor): FieldSelectorSuffix {
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

  return { fieldIndex, subfieldCodes, subfieldRange, subfieldIndex, charRange, indicator };
}

// ---------------------------------------------------------------------------
// Subspec (predicate) parsing
// ---------------------------------------------------------------------------

const SUBSPEC_OPERATORS: readonly SubSpecOperator[] = ['!=', '!~', '=', '~', '?', '!'];
// 2-char operators are listed before their 1-char prefixes ('!=', '!~' before
// '!') so we don't mis-tokenize '!=' as a bare '!' followed by a dangling '='.

const ESCAPABLE_CHARS = new Set(['$', '{', '}', '!', '=', '~', '?', '|', '\\']);

function peekOperator(cursor: Cursor): SubSpecOperator | undefined {
  for (const op of SUBSPEC_OPERATORS) {
    if (cursor.spec.startsWith(op, cursor.pos)) return op;
  }
  return undefined;
}

function looksLikeTagStart(ch: string | undefined): boolean {
  return ch === '.' || isDigit(ch) || isAlphaLower(ch) || isAlphaUpper(ch);
}

/**
 * Parse a subTerm's spec operand (fieldSpec/subfieldSpec/indicatorSpec,
 * possibly an abbreviation). An abbreviation omits the leading tag entirely
 * (spec starts directly with "$", "^", "[", or "/"); it inherits `contextTag`,
 * the tag of the spec this subspec is attached to.
 */
function parseNestedSpec(cursor: Cursor, contextTag: string): FieldSpecAst {
  let tag: string;
  const ch = cursor.peek();
  if (ch === '$' || ch === '^' || ch === '[' || ch === '/') {
    tag = contextTag;
  } else if (looksLikeTagStart(ch)) {
    tag = parseTag(cursor);
  } else {
    cursor.error(
      'Expected a field tag, subfield code, indicator, or character range in subspec term'
    );
  }

  const suffix = parseFieldSelectorSuffix(cursor);
  return { tag, ...suffix };
}

/** Parse a `\`-prefixed literal comparison string, applying escape rules. */
function parseComparisonString(cursor: Cursor): string {
  cursor.pos++; // consume leading '\'
  let value = '';
  for (;;) {
    const ch = cursor.peek();
    if (ch === undefined || ch === '|' || ch === '}') {
      break;
    }
    if (ch === '\\') {
      const next = cursor.spec[cursor.pos + 1];
      if (next === 's') {
        value += ' ';
        cursor.pos += 2;
        continue;
      }
      if (next !== undefined && ESCAPABLE_CHARS.has(next)) {
        value += next;
        cursor.pos += 2;
        continue;
      }
      cursor.error('Invalid escape sequence in comparison string');
    }
    if (ch === '=' || ch === '~' || ch === '!' || ch === '?') {
      cursor.error(`Character "${ch}" must be escaped with "\\" in a comparison string`);
    }
    value += ch;
    cursor.pos++;
  }
  return value;
}

function parseSubTerm(cursor: Cursor, contextTag: string): SubTerm {
  if (cursor.peek() === '\\') {
    return { kind: 'string', value: parseComparisonString(cursor) };
  }
  return { kind: 'spec', spec: parseNestedSpec(cursor, contextTag) };
}

function parseSubTermSet(cursor: Cursor, contextTag: string): SubTermSet {
  // Unary prefix form: operator comes first, left is omitted.
  const leadingOp = peekOperator(cursor);
  if (leadingOp === '?' || leadingOp === '!') {
    cursor.pos += leadingOp.length;
    const right = parseSubTerm(cursor, contextTag);
    return { left: undefined, operator: leadingOp, right };
  }

  // Otherwise, parse a subTerm first, then decide if it's `left` (an operator
  // follows) or the bare `right` (operator/left both omitted, operator
  // defaulting to '?').
  const firstTerm = parseSubTerm(cursor, contextTag);
  const op = peekOperator(cursor);
  if (op === undefined) {
    return { left: undefined, operator: '?', right: firstTerm };
  }
  cursor.pos += op.length;
  const secondTerm = parseSubTerm(cursor, contextTag);
  return { left: firstTerm, operator: op, right: secondTerm };
}

function parseSubSpec(cursor: Cursor, contextTag: string): SubSpec {
  cursor.pos++; // consume '{'
  const subTermSets: SubTermSet[] = [parseSubTermSet(cursor, contextTag)];
  while (cursor.peek() === '|') {
    cursor.pos++; // consume '|'
    subTermSets.push(parseSubTermSet(cursor, contextTag));
  }
  if (cursor.peek() !== '}') {
    cursor.error('Expected "}" to close subspec');
  }
  cursor.pos++; // consume '}'
  return { subTermSets };
}

/**
 * Parse a MARCspec addressing string into an AST.
 * Supports field tags, subfield codes/ranges, character ranges, field/subfield
 * occurrence indices, indicators, and comparison/predicate subspecs (`{...}`).
 * Throws MarcSpecParseError for malformed specs.
 */
export function parseMarcSpec(spec: string): MarcSpecAst {
  const cursor = new Cursor(spec);
  if (spec.length === 0) {
    cursor.error('MARCspec string must not be empty');
  }

  const tag = parseTag(cursor);
  const suffix = parseFieldSelectorSuffix(cursor);

  let subSpecs: SubSpec[] | undefined;
  if (cursor.peek() === '{') {
    subSpecs = [];
    while (cursor.peek() === '{') {
      subSpecs.push(parseSubSpec(cursor, tag));
    }
  }

  if (!cursor.eof()) {
    cursor.error(`Unexpected character "${cursor.peek()}"`);
  }

  return { tag, ...suffix, subSpecs };
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

// ---------------------------------------------------------------------------
// Subspec (predicate) evaluation
// ---------------------------------------------------------------------------

/**
 * Resolve a (possibly nested) field/subfield/indicator spec's values against
 * a record, for use both as the top-level `getBySpec` resolution and as a
 * subTerm operand inside a subspec comparison.
 *
 * `contextField`/`contextOccurrence` describe the field occurrence that the
 * enclosing spec (the one this subspec is attached to) is currently on. When
 * `spec` has no explicit field-occurrence index and its tag matches
 * `contextField`'s tag (including wildcards), the lookup is scoped to that
 * single occurrence — this is what makes an abbreviation or same-tag
 * reference (e.g. `020$c{?020$a}`) a "sibling in this same field instance"
 * check rather than a record-wide search. A different tag, or an explicit
 * index, always resolves independently against the whole record.
 */
function resolveSpecValues(
  spec: FieldSpecAst,
  record: MarcRecord,
  contextField: ControlField | DataField | undefined,
  contextOccurrence: number
): string[] {
  if (spec.tag === 'LDR') {
    return [sliceByRange(record.leader, spec.charRange)];
  }

  const allMatchingFields = record.fields
    .map((field, index) => ({ field, index }))
    .filter(({ field }) => matchesTag(field.tag, spec.tag));

  const isImplicitlyScoped =
    spec.fieldIndex === undefined &&
    contextField !== undefined &&
    matchesTag(contextField.tag, spec.tag);

  const selectedFields =
    spec.fieldIndex !== undefined
      ? selectByRange(allMatchingFields, spec.fieldIndex)
      : isImplicitlyScoped
        ? allMatchingFields.filter(({ index }) => index === contextOccurrence)
        : allMatchingFields;

  const values: string[] = [];

  for (const { field } of selectedFields) {
    if (spec.indicator !== undefined) {
      if (!isDataField(field)) continue;
      const value = spec.indicator === '1' ? field.indicator1 : field.indicator2;
      values.push(sliceByRange(value, spec.charRange));
      continue;
    }

    const subfieldCodes = resolveSubfieldCodes(spec);
    if (subfieldCodes !== undefined) {
      if (!isDataField(field)) continue;
      const selectedByCode = new Set<number>();
      for (const code of subfieldCodes) {
        const matchingSubfields = field.subfields
          .map((sf, sfIndex) => ({ sf, sfIndex }))
          .filter(({ sf }) => sf.code === code);
        for (const { sfIndex } of selectByRange(matchingSubfields, spec.subfieldIndex)) {
          selectedByCode.add(sfIndex);
        }
      }
      field.subfields.forEach((sf, sfIndex) => {
        if (selectedByCode.has(sfIndex)) values.push(sliceByRange(sf.value, spec.charRange));
      });
      continue;
    }

    if (!isControlField(field)) continue;
    values.push(sliceByRange(field.data, spec.charRange));
  }

  return values;
}

function resolveSubTerm(
  subTerm: SubTerm,
  record: MarcRecord,
  contextField: ControlField | DataField | undefined,
  contextOccurrence: number
): string[] {
  if (subTerm.kind === 'string') return [subTerm.value];
  return resolveSpecValues(subTerm.spec, record, contextField, contextOccurrence);
}

function evaluateSubTermSet(
  subTermSet: SubTermSet,
  record: MarcRecord,
  contextField: ControlField | DataField | undefined,
  contextOccurrence: number
): boolean {
  const rightValues = resolveSubTerm(subTermSet.right, record, contextField, contextOccurrence);

  if (subTermSet.operator === '?') return rightValues.length > 0;
  if (subTermSet.operator === '!') return rightValues.length === 0;

  // Binary operators always have `left` present (guaranteed by the parser).
  const leftValues = resolveSubTerm(
    subTermSet.left as SubTerm,
    record,
    contextField,
    contextOccurrence
  );

  // `=`/`~` use existential (ANY-left x ANY-right) matching. `!=`/`!~` are the
  // De Morgan negation of `=`/`~` ("no pair matches"), not "some pair fails to
  // match" — the latter is nearly always true for multi-valued comparisons
  // and would make the operator a useless filter; De Morgan negation also
  // mirrors `?`/`!` being exact complements of each other.
  switch (subTermSet.operator) {
    case '=':
      return leftValues.some((l) => rightValues.some((r) => l === r));
    case '!=':
      return !leftValues.some((l) => rightValues.some((r) => l === r));
    case '~':
      return leftValues.some((l) => rightValues.some((r) => l.includes(r)));
    case '!~':
      return !leftValues.some((l) => rightValues.some((r) => l.includes(r)));
  }
}

function evaluateSubSpec(
  subSpec: SubSpec,
  record: MarcRecord,
  contextField: ControlField | DataField | undefined,
  contextOccurrence: number
): boolean {
  return subSpec.subTermSets.some((subTermSet) =>
    evaluateSubTermSet(subTermSet, record, contextField, contextOccurrence)
  );
}

function evaluateSubSpecs(
  subSpecs: readonly SubSpec[],
  record: MarcRecord,
  contextField: ControlField | DataField | undefined,
  contextOccurrence: number
): boolean {
  return subSpecs.every((subSpec) =>
    evaluateSubSpec(subSpec, record, contextField, contextOccurrence)
  );
}

/**
 * Resolve a MARCspec addressing string against a record.
 * Returns an empty array if the spec is syntactically valid but matches
 * nothing in the given record. Throws MarcSpecParseError for malformed spec
 * strings.
 */
export function getBySpec(record: MarcRecord, spec: string): MarcSpecMatch[] {
  const ast = parseMarcSpec(spec);

  // LDR is not a member of record.fields; handle it as a synthetic single field.
  if (ast.tag === 'LDR') {
    if (ast.subSpecs !== undefined && !evaluateSubSpecs(ast.subSpecs, record, undefined, 0)) {
      return [];
    }
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
    if (ast.subSpecs !== undefined && !evaluateSubSpecs(ast.subSpecs, record, field, occurrence)) {
      continue;
    }

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
