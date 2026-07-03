# marc-ts

> TypeScript MARC21 library for Node.js and browsers

[![npm version](https://img.shields.io/npm/v/marc-ts.svg)](https://www.npmjs.com/package/marc-ts)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Four formats** — ISO2709 binary, MARCXML, MARC-in-JSON, MARCBreaker/marctxt
- **Consistent API** — every format uses `parse*(input) → MarcRecord[]` and `serialize*(records) → output`
- **Functional-style** — all operations return new objects; originals are never mutated
- **Zero dependencies** — no runtime deps, including no XML parser. MARCXML has only 5 element types with no arbitrary nesting, so it's parsed with a lightweight hand-rolled tokenizer instead of a full DOM/SAX library. Works in Node.js and modern browsers.
- **Fully typed** — strict TypeScript throughout

## Installation

```bash
npm install marc-ts
```

## Quick Start

```typescript
import { parseMarcBinary, serializeMarcBinary, title, author } from 'marc-ts';
import { parseMarcXml, serializeMarcXml } from 'marc-ts/xml';
import { parseMarcJson, serializeMarcJsonString } from 'marc-ts/json';
import { parseMarcTxt, serializeMarcTxt } from 'marc-ts/txt';

const records = parseMarcBinary(buffer);
console.log(title(records[0]));

const xmlRecords = parseMarcXml(xmlString);
const xml = serializeMarcXml(xmlRecords);

const jsonRecords = parseMarcJson(jsonString);
const json = serializeMarcJsonString(jsonRecords);

const txtRecords = parseMarcTxt(txtString);
const txt = serializeMarcTxt(txtRecords);
```

## Formats

### ISO2709 Binary (`marc-ts`)

```typescript
import { parseMarcBinary, serializeMarcBinary } from 'marc-ts';
```

#### `parseMarcBinary(buffer, options?): MarcRecord[]`

Splits on `0x1D` record terminators and parses each record. Failed records are skipped in lenient mode; `strict: true` throws on the first error.

| Option        | Type      | Default | Description                                           |
| ------------- | --------- | ------- | ----------------------------------------------------- |
| `strict`      | `boolean` | `false` | Throw on fatal parse errors instead of skipping       |
| `maxWarnings` | `number`  | `100`   | Stop collecting warnings after this many (per record) |

Leader byte 9 controls character decoding: `'a'` = UTF-8, `' '` = MARC-8. MARC-8 handles ANSEL Latin, Greek, Hebrew, Cyrillic, Arabic, and sub/superscript scripts. EACC/CJK coverage is minimal (~33 of ~16k triples) — prefer UTF-8 sources for CJK catalogs.

#### `parseMarcBinaryWithWarnings(buffer, options?): ParseBatchResult`

Same as `parseMarcBinary`, but returns per-record results with warnings. Failed records appear with `record: null`.

#### `serializeMarcBinary(records, options?): Uint8Array`

| Option        | Type                | Default  | Description                                                         |
| ------------- | ------------------- | -------- | ------------------------------------------------------------------- |
| `encoding`    | `'utf8' \| 'marc8'` | `'utf8'` | Character encoding; `'marc8'` replaces unsupported Unicode with `?` |
| `maxWarnings` | `number`            | `100`    | Stop collecting warnings after this many (per record)               |

#### `serializeMarcBinaryWithWarnings(records, options?): SerializeBatchResult`

Same as `serializeMarcBinary`, but returns per-record serialization warnings alongside the bytes.

---

### MARCXML (`marc-ts/xml`)

```typescript
import { parseMarcXml, serializeMarcXml } from 'marc-ts/xml';
```

#### `parseMarcXml(xml): MarcRecord[]`

Accepts `<collection>`, bare `<record>` elements, or namespace-prefixed variants. Returns `[]` for empty input.

#### `serializeMarcXml(records): string`

Produces a full MARCXML `<collection>` document with XML declaration and MARC21 namespace.

---

### MARC-in-JSON (`marc-ts/json`)

```typescript
import { parseMarcJson, serializeMarcJson, serializeMarcJsonString } from 'marc-ts/json';
```

Implements the [MARC-in-JSON](https://wiki.code4lib.org/MARCJSONification) spec.

#### `parseMarcJson(json): MarcRecord[]`

Accepts a JSON string (array or single object), a `MarcJsonObject[]`, or a single `MarcJsonObject`.

#### `serializeMarcJson(records): MarcJsonObject[]`

#### `serializeMarcJsonString(records): string`

---

### MARCBreaker / marctxt (`marc-ts/txt`)

```typescript
import { parseMarcTxt, serializeMarcTxt } from 'marc-ts/txt';
```

Line-oriented format: one field per line, blank lines between records, `$` for subfield delimiters, `\` for blank indicators.

Reserved characters are escaped: `$` → `{dollar}`, `{` → `{lcub}`, `}` → `{rcub}`, `\` → `{bsol}`.

#### `parseMarcTxt(text): MarcRecord[]`

#### `serializeMarcTxt(records): string`

---

## Convenience Accessors

```typescript
import {
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
} from 'marc-ts';
```

| Function                  | Source field | Returns                            |
| ------------------------- | ------------ | ---------------------------------- |
| `title(record)`           | 245 $a$b     | Full title with subtitle           |
| `titleProper(record)`     | 245 $a       | Main title only                    |
| `author(record)`          | 100/110 $a   | Main author/creator                |
| `edition(record)`         | 250 $a       | Edition statement                  |
| `publisher(record)`       | 260/264 $b   | Publisher name                     |
| `publicationDate(record)` | 260/264 $c   | Publication date                   |
| `isbn(record)`            | 020 $a       | `string[]` of ISBNs                |
| `issn(record)`            | 022 $a       | ISSN                               |
| `lccn(record)`            | 010 $a       | Library of Congress Control Number |
| `subjects(record)`        | 6XX $a       | `string[]` of subject headings     |
| `seriesStatement(record)` | 490 $a       | Series statement                   |

---

## Field Access

```typescript
import { getField, getFields, getSubfield, getSubfields, getAllSubfields } from 'marc-ts';
import { isControlField, isDataField } from 'marc-ts';
```

```typescript
const field = getField(record, '245'); // first match or undefined
const fields = getFields(record, '650'); // all matches

if (field && isDataField(field)) {
  const a = getSubfield(field, 'a');
  const xs = getSubfields(field, 'x');
  const all = getAllSubfields(field); // [{ code, value }, ...]
}
```

## Wildcard Querying

```typescript
import { getFieldsByPattern, getFirstFieldByPattern } from 'marc-ts';

const subjects = getFieldsByPattern(record, '6..'); // all 6XX fields
```

`.` and `X` each match any single digit.

---

## MARCspec Querying

```typescript
import { getBySpec, getValuesBySpec, parseMarcSpec } from 'marc-ts';

getValuesBySpec(record, '245$a'); // ['The Catcher in the Rye /']
getValuesBySpec(record, '650$a-c'); // subfield range
getValuesBySpec(record, '300[0]$a'); // first occurrence (0-indexed)
getValuesBySpec(record, '300[#]$a'); // last occurrence
getValuesBySpec(record, '245$a/0-2'); // character range -> 'The'
getValuesBySpec(record, '880^1'); // indicator 1
getValuesBySpec(record, 'LDR/6'); // leader character range

const matches = getBySpec(record, '650$x');
// [{ tag: '650', occurrence: 0, subfieldCode: 'x', value: '...' }, ...]

const ast = parseMarcSpec('245$a/0-2'); // parse without evaluating
```

Implements the field/subfield addressing subset of the [MARCspec](https://marcspec.github.io/MARCspec/) standard: tags (incl. `.` wildcards and `LDR`), subfield codes and ranges (`$a-c`), character ranges (`/1-3`, `/#` for last), 0-indexed field/subfield occurrences (`[0]`, `[#]` for last), and indicators (`^1`, `^2`). Comparison/predicate subspecs (e.g. `020$c{?020$a}`) are not supported and throw `MarcSpecParseError`. A spec that's syntactically valid but matches nothing returns `[]`.

---

## Field Operations

All operations return new objects — originals are never mutated.

```typescript
import {
  appendField,
  insertFieldBefore,
  insertFieldAfter,
  insertGroupedField,
  removeFields,
  removeField,
  addSubfield,
  removeSubfield,
  replaceSubfield,
} from 'marc-ts';

const r1 = appendField(record, newField);
const r2 = insertFieldBefore(record, '700', newField);
const r3 = insertFieldAfter(record, '245', newField);
const r4 = insertGroupedField(record, newField); // maintains MARC tag order
const r5 = removeFields(record, '650');
const r6 = removeField(record, specificField); // reference equality

const f1 = addSubfield(field, 'b', 'Subtitle');
const f2 = removeSubfield(field, 'x');
const f3 = replaceSubfield(field, 'a', 'New value');
```

---

## Clone and Equality

```typescript
import { cloneRecord, recordsEqual, fieldsEqual } from 'marc-ts';

const copy = cloneRecord(record);
recordsEqual(a, b); // strict field order
recordsEqual(a, b, true); // ignore field order
fieldsEqual(field1, field2);
```

---

## Types

```typescript
import type {
  MarcRecord,
  ControlField,
  DataField,
  Subfield,
  ParseOptions,
  SerializeOptions,
  MarcWarning,
  MarcWarningType,
} from 'marc-ts';
```

---

## Development

Requires Node.js **20.19** or **22.12+** (driven by Vite 8).

```bash
npm test            # run tests
npm run build       # compile to dist/
npm run type-check  # TypeScript check without emit
```
