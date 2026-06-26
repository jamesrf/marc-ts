# marc-ts

> TypeScript MARC21 library for Node.js and browsers

[![npm version](https://img.shields.io/npm/v/marc-ts.svg)](https://www.npmjs.com/package/marc-ts)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Four formats** — ISO2709 binary, MARCXML, MARC-in-JSON, MARCBreaker/marctxt
- **Consistent API** — every format uses `parse*(input) → MarcRecord[]` and `serialize*(records[]) → <native>`
- **Immutable** — all operations return new objects, never mutate
- **Zero dependencies** — works in Node.js and modern browsers
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

// Binary (ISO2709) — splits on 0x1D, returns all records
const records = parseMarcBinary(buffer);
console.log(title(records[0]));
console.log(author(records[0]));
const binary = serializeMarcBinary(records);

// MARCXML — parses <collection> or bare <record> elements
const xmlRecords = parseMarcXml(xmlString);
const xml = serializeMarcXml(xmlRecords);

// MARC-in-JSON — accepts array, single object, or JSON string
const jsonRecords = parseMarcJson(jsonString);
const json = serializeMarcJsonString(jsonRecords);

// MARCBreaker — records separated by blank lines
const txtRecords = parseMarcTxt(txtString);
const txt = serializeMarcTxt(txtRecords);
```

## Formats

### ISO2709 Binary (`marc-ts`)

```typescript
import { parseMarcBinary, serializeMarcBinary } from 'marc-ts';
import type { ParseOptions, SerializeOptions } from 'marc-ts';
```

#### `parseMarcBinary(buffer, options?): MarcRecord[]`

Parse a concatenated ISO2709 binary stream. Splits on `0x1D` (RECORD_TERMINATOR) and parses each record. Records that fail to parse are silently skipped in lenient mode; with `strict: true` the first error throws.

```typescript
const records = parseMarcBinary(buffer);
const strict = parseMarcBinary(buffer, { strict: true });
```

**`ParseOptions`**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `strict` | `boolean` | `false` | Throw on fatal parse errors instead of skipping |
| `maxWarnings` | `number` | `100` | Stop collecting warnings after this many (per record) |

**Character encoding.** Leader byte 9 controls decoding: `'a'` = UTF-8, `' '` (space) = MARC-8. MARC-8 decoding handles ANSEL Latin, Greek, Hebrew, Cyrillic, Arabic, and subscript/superscript scripts via escape-designated sequences. EACC/CJK coverage is limited (~33 of ~16,000 official triples); records with substantial CJK content will mostly decode to U+FFFD — prefer UTF-8 sources for CJK catalogs.

#### `parseMarcBinaryWithWarnings(buffer, options?): ParseBatchResult`

Same as `parseMarcBinary`, but returns per-record parse results with warnings. Records that fail to parse are included (with `record: null`) so callers can inspect their warnings.

```typescript
import { parseMarcBinaryWithWarnings } from 'marc-ts';

const { results } = parseMarcBinaryWithWarnings(buffer);
for (const [i, result] of results.entries()) {
  if (result.warnings.length > 0) {
    console.log(`Record ${i}: ${result.warnings.length} warnings`);
  }
  if (!result.record) {
    console.log(`Record ${i} failed to parse`, result.warnings);
  }
}
```

#### `serializeMarcBinary(records, options?): Uint8Array`

Serialize an array of records to a concatenated ISO2709 binary stream. Each record is individually serialized with its own `0x1D` terminator.

```typescript
const buffer = serializeMarcBinary(records);
const marc8Buffer = serializeMarcBinary(records, { encoding: 'marc8' });
```

**`SerializeOptions`**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `encoding` | `'utf8' \| 'marc8'` | `'utf8'` | Character encoding; `'marc8'` replaces unsupported Unicode with `?` |
| `maxWarnings` | `number` | `100` | Stop collecting warnings after this many (per record) |

#### `serializeMarcBinaryWithWarnings(records, options?): SerializeBatchResult`

Same as `serializeMarcBinary`, but returns per-record serialization warnings alongside the concatenated bytes. Useful for detecting lossy MARC-8 encoding.

```typescript
import { serializeMarcBinaryWithWarnings } from 'marc-ts';

const { bytes, results } = serializeMarcBinaryWithWarnings(records, { encoding: 'marc8' });
for (const [i, result] of results.entries()) {
  if (result.warnings.length > 0) {
    console.log(`Record ${i}: ${result.warnings.length} encoding warnings`);
  }
}
```

---

### MARCXML (`marc-ts/xml`)

```typescript
import { parseMarcXml, serializeMarcXml } from 'marc-ts/xml';
```

#### `parseMarcXml(xml): MarcRecord[]`

Parse a MARCXML string. Accepts a `<collection>` document, bare `<record>` elements, or namespace-prefixed variants (e.g. `marc:record`). Returns all records found; returns `[]` for empty or record-free input.

```typescript
const records = parseMarcXml(xmlString);
```

#### `serializeMarcXml(records): string`

Serialize records to a full MARCXML `<collection>` document with XML declaration and MARC21 namespace.

```typescript
const xml = serializeMarcXml(records);
```

---

### MARC-in-JSON (`marc-ts/json`)

```typescript
import { parseMarcJson, serializeMarcJson, serializeMarcJsonString } from 'marc-ts/json';
import type { MarcJsonObject } from 'marc-ts/json';
```

The [MARC-in-JSON](https://wiki.code4lib.org/MARCJSONification) format represents each field as a single-key object:

```json
{
  "leader": "01142cam a2200301 a 4500",
  "fields": [
    { "001": "5490" },
    { "245": { "subfields": [{ "a": "The Hobbit" }], "ind1": "1", "ind2": "0" } }
  ]
}
```

#### `parseMarcJson(json): MarcRecord[]`

Parse MARC-in-JSON into records. Accepts:
- A JSON string whose top-level value is an array or a single object
- A `MarcJsonObject[]` array
- A single `MarcJsonObject`

Always returns `MarcRecord[]`. Throws on structural errors.

```typescript
const records = parseMarcJson(jsonString);       // JSON string (array or single)
const records = parseMarcJson([obj1, obj2]);     // plain object array
const records = parseMarcJson(singleObj);        // single object → one-element array
```

#### `serializeMarcJson(records): MarcJsonObject[]`

Serialize records to an array of MARC-in-JSON plain objects.

```typescript
const objs = serializeMarcJson(records);
```

#### `serializeMarcJsonString(records): string`

Serialize records directly to a JSON string (a JSON array).

```typescript
const json = serializeMarcJsonString(records);
```

---

### MARCBreaker / marctxt (`marc-ts/txt`)

```typescript
import { parseMarcTxt, serializeMarcTxt } from 'marc-ts/txt';
```

MARCBreaker is a human-readable line-oriented format. Each field occupies one line; blank indicators are written as `\`; subfields use `$` followed by a single-character code. Records are separated by blank lines:

```
=LDR  00706cam a2200217 a 4500
=001  5490
=003  OCoLC
=245  14$aThe Hobbit /$cJ.R.R. Tolkien.
=650  \1$aHobbits (Fictitious characters)$vFiction.
```

**Value escaping** — reserved characters in field values are escaped as follows:

| Character | Escaped form |
|-----------|-------------|
| `$` | `{dollar}` |
| `{` | `{lcub}` |
| `}` | `{rcub}` |
| `\` | `{bsol}` |

Embedded newlines in values are replaced with a space on serialize.

#### `parseMarcTxt(text): MarcRecord[]`

Parse a marctxt string. Accepts `\n` and `\r\n` line endings. Records are separated by blank lines. Returns all records found.

```typescript
const records = parseMarcTxt(txtString);
```

#### `serializeMarcTxt(records): string`

Serialize records to a marctxt string, with records separated by blank lines.

```typescript
const txt = serializeMarcTxt(records);
```

---

## Convenience Accessors

Extract common bibliographic metadata from any `MarcRecord`:

```typescript
import { title, titleProper, author, edition, publisher, publicationDate,
         isbn, issn, lccn, subjects, seriesStatement } from 'marc-ts';
```

| Function | Source field | Returns |
|----------|-------------|---------|
| `title(record)` | 245 $a$b | Full title with subtitle |
| `titleProper(record)` | 245 $a | Main title only |
| `author(record)` | 100/110 $a | Main author/creator |
| `edition(record)` | 250 $a | Edition statement |
| `publisher(record)` | 260/264 $b | Publisher name |
| `publicationDate(record)` | 260/264 $c | Publication date |
| `isbn(record)` | 020 $a | `string[]` of ISBNs |
| `issn(record)` | 022 $a | ISSN |
| `lccn(record)` | 010 $a | Library of Congress Control Number |
| `subjects(record)` | 6XX $a | `string[]` of subject headings |
| `seriesStatement(record)` | 490 $a | Series statement |

---

## Field Access

```typescript
import { getField, getFields, getSubfield, getSubfields, getAllSubfields } from 'marc-ts';
import { isControlField, isDataField } from 'marc-ts';
```

#### `getField(record, tag)` / `getFields(record, tag)`

```typescript
const field = getField(record, '245');        // first match or undefined
const fields = getFields(record, '650');      // all matches
```

#### `getSubfield(field, code)` / `getSubfields(field, code)`

```typescript
if (field && isDataField(field)) {
  const a = getSubfield(field, 'a');          // first $a or undefined
  const xs = getSubfields(field, 'x');        // all $x values
}
```

#### `getAllSubfields(field)`

```typescript
const all = getAllSubfields(field);           // [{ code, value }, ...]
```

---

## Wildcard Querying

```typescript
import { getFieldsByPattern, getFirstFieldByPattern } from 'marc-ts';

const subjects = getFieldsByPattern(record, '6..');   // all 6XX fields
const first7xx = getFirstFieldByPattern(record, '7XX');
```

`.` and `X` each match any single digit.

---

## Field Operations (Immutable)

All operations return a new `MarcRecord` without modifying the original.

```typescript
import {
  appendField, insertFieldBefore, insertFieldAfter, insertGroupedField,
  removeFields, removeField,
  addSubfield, removeSubfield, replaceSubfield,
} from 'marc-ts';

const r1 = appendField(record, newField);
const r2 = insertFieldBefore(record, '700', newField);
const r3 = insertFieldAfter(record, '245', newField);
const r4 = insertGroupedField(record, newField);  // maintains MARC block order
const r5 = removeFields(record, '650');
const r6 = removeField(record, specificField);    // reference equality

// Subfield operations — return a new DataField
const f1 = addSubfield(field, 'b', 'Subtitle');
const f2 = removeSubfield(field, 'x');
const f3 = replaceSubfield(field, 'a', 'New value');
```

---

## Clone and Equality

```typescript
import { cloneRecord, recordsEqual, fieldsEqual } from 'marc-ts';

const copy = cloneRecord(record);
recordsEqual(a, b);              // strict field order
recordsEqual(a, b, true);        // ignore field order
fieldsEqual(field1, field2);
```

---

## Types

```typescript
import type { MarcRecord, ControlField, DataField, Subfield,
              ParseOptions, SerializeOptions, MarcWarning, MarcWarningType } from 'marc-ts';
```

---

## Development

Requires Node.js **20.19** or **22.12+** (driven by Vite 8). The compiled output targets modern browsers and any actively-supported Node release.

```bash
npm test            # run tests
npm run build       # compile to dist/
npm run type-check  # TypeScript check without emit
```
