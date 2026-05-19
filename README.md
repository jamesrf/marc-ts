# marc-ts

> TypeScript MARC21 library for Node.js and browsers

[![npm version](https://img.shields.io/npm/v/marc-ts.svg)](https://www.npmjs.com/package/marc-ts)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Immutable API** - All operations return new objects, never mutate existing records
- **Zero runtime dependencies** - Works in browsers and Node.js (≥14) without any dependencies
- **Type-safe** - Full TypeScript type definitions with strict typing
- **Well-tested** - >90% code coverage with comprehensive test suite
- **Universal** - Runs in Node.js and modern browsers (Chrome, Firefox, Safari, Edge)
- **Functional design** - Pure functions for composability and predictability

## Installation

```bash
npm install marc-ts
```

## Quick Start

```typescript
import { parseMarcRecord, serializeMarcRecord, title, author, isbn, subjects } from 'marc-ts';
import { parseMarcXml, serializeMarcXml } from 'marc-ts/xml';
import { parseMarcJson, serializeMarcJsonString } from 'marc-ts/json';

// --- ISO 2709 binary (MARC21) ---
const buffer = new Uint8Array([...]); // Your MARC21 binary data
const result = parseMarcRecord(buffer);

if (result.record) {
  console.log('Title:', title(result.record));
  console.log('Author:', author(result.record));
  console.log('ISBNs:', isbn(result.record));
  console.log('Subjects:', subjects(result.record));
}
if (result.warnings.length > 0) {
  console.warn('Parsing warnings:', result.warnings);
}

// Serialize back to binary (UTF-8 by default; pass { encoding: 'marc8' } for MARC-8 output)
const binary = serializeMarcRecord(result.record!, { encoding: 'utf8' });

// --- MARCXML ---
const xmlString = `<?xml version="1.0"?>
<collection xmlns="http://www.loc.gov/MARC21/slim">
  <record>
    <leader>00000nam a2200000   4500</leader>
    <datafield tag="245" ind1="1" ind2="0">
      <subfield code="a">The Hobbit</subfield>
    </datafield>
  </record>
</collection>`;

const [xmlRecord] = parseMarcXml(xmlString);
console.log('Title from XML:', title(xmlRecord));
const roundtripXml = serializeMarcXml([xmlRecord]); // back to a <collection> document

// --- MARC-in-JSON ---
const jsonString = JSON.stringify({
  leader: '00000nam a2200000   4500',
  fields: [
    { '245': { subfields: [{ a: 'The Hobbit' }], ind1: '1', ind2: '0' } },
  ],
});

const jsonRecord = parseMarcJson(jsonString);
console.log('Title from JSON:', title(jsonRecord));
const roundtripJson = serializeMarcJsonString(jsonRecord); // back to a JSON string

// --- MARC-8 binary ---
// parseMarcRecord detects MARC-8 automatically from leader byte 9 (' ');
// records are decoded to Unicode transparently — no special handling needed.
const marc8Buffer = new Uint8Array([...]); // MARC-8 encoded binary
const marc8Result = parseMarcRecord(marc8Buffer); // decoded to Unicode automatically
```

## Why marc-ts?

Existing JavaScript/TypeScript MARC libraries are often:
- Node.js-only (using streams, fs, Buffer APIs)
- Class-based OOP patterns that don't leverage TypeScript's strengths
- Mutable APIs that can lead to unexpected bugs
- Lacking comprehensive type definitions

**marc-ts** addresses these limitations:
- Universal browser and Node.js compatibility
- TypeScript-native with full type safety and functional patterns
- Immutable operations for safer, more predictable code
- Zero runtime dependencies for minimal bundle size

## Core Concepts

### Immutability

Mutation-style operations in **marc-ts** return new records or fields rather than modifying existing ones:

```typescript
const updated = appendField(record, field); // record remains unchanged
```

This approach prevents accidental mutations and makes code easier to reason about, especially in reactive frameworks like React or Vue.

### Functional API

**marc-ts** uses pure functions for maximum composability:

```typescript
// Extract metadata using pure functions
const bookTitle = title(record);
const bookAuthor = author(record);

// Access fields functionally
const titleField = getField(record, '245');
```

### Type Safety

Full TypeScript types ensure compile-time correctness:

```typescript
import type { MarcRecord, DataField } from 'marc-ts';
import { isDataField } from 'marc-ts';

const field = getField(record, '245');
if (field && isDataField(field)) {
  // TypeScript knows field is a DataField
  const titleValue = getSubfield(field, 'a');
}
```

## API Reference

### Parsing and Serialization

#### `parseMarcRecord(buffer, options?): ParseResult`

Parse ISO2709 binary data into a MARC record.

```typescript
const result = parseMarcRecord(buffer, {
  strict: false, // If true, throw on fatal parse errors
  maxWarnings: 100, // Maximum warnings to collect
});

if (result.record) {
  // Successfully parsed
} else {
  // Parsing failed, check result.warnings
}
```

Recoverable issues may still be returned in `warnings`, such as MARC leader compatibility warnings.

#### `parseMarcRecordStrict(buffer): MarcRecord`

Convenience wrapper for strict parsing (throws on fatal parse errors).

```typescript
try {
  const record = parseMarcRecordStrict(buffer);
} catch (error) {
  console.error('Parsing failed:', error);
}
```

#### `serializeMarcRecord(record): Uint8Array`

Serialize a MARC record to ISO2709 binary format.

```typescript
const buffer = serializeMarcRecord(record);
// Can be written to file or transmitted over network
```

`parseMarcRecord` decodes UTF-8 records and MARC-8 records signaled by leader
byte 9. MARC-8 decoding handles escape-designated scripts such as ANSEL Latin,
Greek, Hebrew, Cyrillic, Arabic, subscript/superscript, and mapped EACC/CJK
triples. MARC-8 serialization is intentionally conservative: `encoding:
'marc8'` writes ASCII plus ANSEL Latin/combining characters and replaces
unsupported Unicode characters with `?`.

### Convenience Accessors

Extract common bibliographic metadata:

| Function | Field | Description | Example |
|----------|-------|-------------|---------|
| `title(record)` | 245 $a$b | Full title with subtitle | `"The Catcher in the Rye"` |
| `titleProper(record)` | 245 $a | Main title only | `"The Catcher in the Rye"` |
| `author(record)` | 100/110 $a | Main author/creator | `"Salinger, J. D."` |
| `edition(record)` | 250 $a | Edition statement | `"1st ed."` |
| `publisher(record)` | 260/264 $b | Publisher name | `"Little, Brown,"` |
| `publicationDate(record)` | 260/264 $c | Publication date | `"1951."` |
| `isbn(record)` | 020 $a | ISBN(s) - array | `["978-0-316-76948-0"]` |
| `issn(record)` | 022 $a | ISSN | `"0028-0836"` |
| `lccn(record)` | 010 $a | Library of Congress Control Number | `"50011915"` |
| `subjects(record)` | 6XX $a | All subject headings - array | `["Fiction", "History"]` |
| `seriesStatement(record)` | 490 $a | Series statement | `"Penguin classics"` |

### Field Access

#### `getField(record, tag): ControlField | DataField | undefined`

Get the first field with a specific tag.

```typescript
const titleField = getField(record, '245');
```

#### `getFields(record, tag): (ControlField | DataField)[]`

Get all fields with a specific tag.

```typescript
const subjectFields = getFields(record, '650');
```

#### `getSubfield(field, code): string | undefined`

Get the first subfield value from a data field.

```typescript
const field = getField(record, '245');
if (field && isDataField(field)) {
  const titleValue = getSubfield(field, 'a');
}
```

#### `getSubfields(field, code): string[]`

Get all subfield values with a specific code (for repeatable subfields).

```typescript
const field = getField(record, '650');
if (field && isDataField(field)) {
  const subdivisions = getSubfields(field, 'x');
}
```

#### `getAllSubfields(field): Array<{ code: string; value: string }>`

Get all subfields from a data field.

```typescript
const field = getField(record, '245');
if (field && isDataField(field)) {
  const allSubfields = getAllSubfields(field);
}
```

### Wildcard Querying

#### `getFieldsByPattern(record, pattern): (ControlField | DataField)[]`

Match fields using wildcard patterns (`.` or `X` = any digit).

```typescript
// Get all 6XX subject fields
const subjects = getFieldsByPattern(record, '6..');

// Get all 7XX added entry fields
const addedEntries = getFieldsByPattern(record, '7XX');

// Get all X00 fields (100, 200, ..., 900)
const x00Fields = getFieldsByPattern(record, 'X00');
```

#### `getFirstFieldByPattern(record, pattern): ControlField | DataField | undefined`

Get the first field matching a wildcard pattern.

```typescript
const firstSubject = getFirstFieldByPattern(record, '6..');
```

### Field Operations (Immutable)

All operations return new records/fields without mutating the original.

#### `appendField(record, field): MarcRecord`

Append a field to the end of a record.

```typescript
const newField: DataField = {
  tag: '650',
  indicator1: ' ',
  indicator2: '0',
  subfields: [{ code: 'a', value: 'New subject' }],
};

const updated = appendField(record, newField);
// record is unchanged, updated has the new field
```

#### `insertFieldBefore(record, tag, field): MarcRecord`

Insert a field before the first occurrence of a tag.

```typescript
const updated = insertFieldBefore(record, '700', newField);
```

#### `insertFieldAfter(record, tag, field): MarcRecord`

Insert a field after the first occurrence of a tag.

```typescript
const updated = insertFieldAfter(record, '245', newField);
```

#### `insertGroupedField(record, field): MarcRecord`

Insert a field maintaining MARC block order (00X → 0XX → 1XX → ... → 9XX).

```typescript
const updated = insertGroupedField(record, field);
// Field is inserted in proper MARC order
```

#### `removeFields(record, tag): MarcRecord`

Remove all fields with a specific tag.

```typescript
const updated = removeFields(record, '650');
```

#### `removeField(record, field): MarcRecord`

Remove a specific field instance using reference equality.

```typescript
const field = getField(record, '650');
const updated = field ? removeField(record, field) : record;
```

#### Subfield Operations

```typescript
// Add subfield to a field
const updated = addSubfield(field, 'b', 'Subtitle');

// Remove all subfields with code
const updated = removeSubfield(field, 'x');

// Replace first subfield with code
const updated = replaceSubfield(field, 'a', 'New value');
```

### Clone and Equality

#### `cloneRecord(record): MarcRecord`

Create a deep copy of a record.

```typescript
const copy = cloneRecord(record);
// Modifying copy will not affect record
```

#### `recordsEqual(a, b, ignoreFieldOrder?): boolean`

Check if two records are equal.

```typescript
if (recordsEqual(record1, record2)) {
  console.log('Records are identical');
}

// Ignore field order
if (recordsEqual(record1, record2, true)) {
  console.log('Records have same content');
}
```

#### `fieldsEqual(a, b): boolean`

Check if two fields are equal.

```typescript
if (fieldsEqual(field1, field2)) {
  console.log('Fields are identical');
}
```

### Warnings

#### `createWarning(type, message, position?, tag?): MarcWarning`

Create a parsing warning object.

```typescript
const warning = createWarning('invalid_field', 'Field is out of bounds', 42, '245');
```

## Additional Formats

### MARCXML (`marc-ts/xml`)

Import from the `marc-ts/xml` subpath for MARCXML support (Library of Congress schema).

```typescript
import {
  parseMarcXml,
  parseMarcXmlRecord,
  serializeMarcXml,
  serializeMarcXmlRecord,
} from 'marc-ts/xml';
```

#### `parseMarcXml(xml): MarcRecord[]`

Parse a MARCXML string containing a `<collection>` or one or more bare `<record>` elements.

```typescript
const records = parseMarcXml(xmlString);
// Returns all records found in the document
```

#### `parseMarcXmlRecord(xml): MarcRecord`

Parse a MARCXML string expected to contain exactly one `<record>`. Throws if none is found.

```typescript
const record = parseMarcXmlRecord(xmlString);
```

#### `serializeMarcXml(records): string`

Serialize one or more records into a full MARCXML `<collection>` document (with XML declaration).

```typescript
const xml = serializeMarcXml([record1, record2]);
```

#### `serializeMarcXmlRecord(record): string`

Serialize a single record to a `<record>` XML element string (no collection wrapper or XML declaration).

```typescript
const recordXml = serializeMarcXmlRecord(record);
```

---

### MARC-in-JSON (`marc-ts/json`)

Import from the `marc-ts/json` subpath for [MARC-in-JSON](https://wiki.code4lib.org/MARCJSONification) support (used by Open Library and many REST APIs).

```typescript
import {
  parseMarcJson,
  serializeMarcJson,
  serializeMarcJsonString,
} from 'marc-ts/json';
import type { MarcJsonObject } from 'marc-ts/json';
```

The format represents each field as a single-key object in an array:

```json
{
  "leader": "01142cam a2200301 a 4500",
  "fields": [
    { "001": "5490" },
    { "245": { "subfields": [{ "a": "The Hobbit" }], "ind1": "1", "ind2": "0" } }
  ]
}
```

#### `parseMarcJson(json): MarcRecord`

Parse a MARC-in-JSON object or JSON string into a `MarcRecord`. Throws on structural errors.

```typescript
const record = parseMarcJson(jsonString);      // from a JSON string
const record = parseMarcJson(jsonObject);      // from a plain object
```

#### `serializeMarcJson(record): MarcJsonObject`

Serialize a `MarcRecord` to a MARC-in-JSON plain object.

```typescript
const obj = serializeMarcJson(record);
// obj.leader, obj.fields — ready for JSON.stringify or further processing
```

#### `serializeMarcJsonString(record): string`

Serialize a `MarcRecord` directly to a JSON string.

```typescript
const json = serializeMarcJsonString(record);
```

---

## Browser Usage

**marc-ts** works in modern browsers without any bundler configuration:

```html
<!DOCTYPE html>
<html>
<head>
  <title>marc-ts Browser Example</title>
</head>
<body>
  <input type="file" id="fileInput" accept=".mrc" />
  <pre id="output"></pre>

  <script type="module">
    import { parseMarcRecord, title, author } from 'https://cdn.skypack.dev/marc-ts';

    document.getElementById('fileInput').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      const arrayBuffer = await file.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);

      const result = parseMarcRecord(buffer);
      if (result.record) {
        document.getElementById('output').textContent = `
Title: ${title(result.record) || 'N/A'}
Author: ${author(result.record) || 'N/A'}
        `;
      }
    });
  </script>
</body>
</html>
```

## Examples

See the [examples/](./examples/) directory for more examples:
- [basic-usage.ts](./examples/basic-usage.ts) - Common usage patterns
- [browser.html](./examples/browser.html) - Browser integration

## Development

Requires Node.js **20.19** or **22.12+** (driven by Vite 8). Older Node versions
are EOL and will fail to install the dev toolchain. The compiled output is
compatible with modern browsers and any actively-supported Node release.
