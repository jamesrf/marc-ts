# marc-ts

> TypeScript MARC21 library with Perl MARC::Record API compatibility for Node.js and browsers

[![npm version](https://img.shields.io/npm/v/marc-ts.svg)](https://www.npmjs.com/package/marc-ts)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- 🎯 **Familiar to Perl MARC::Record users** - Same method names and behaviors for easy migration
- 🔒 **Immutable API** - All operations return new objects, never mutate existing records
- 📦 **Zero runtime dependencies** - Works in browsers and Node.js (≥14) without any dependencies
- 🔍 **Type-safe** - Full TypeScript type definitions with strict typing
- ✅ **Well-tested** - >90% code coverage with comprehensive test suite
- 🌐 **Universal** - Runs in Node.js and modern browsers (Chrome, Firefox, Safari, Edge)

## Installation

```bash
npm install marc-ts
```

## Quick Start

```typescript
import { parseMarcRecord, title, author, isbn, subjects } from 'marc-ts';

// Parse MARC21 binary data (ISO2709 format)
const buffer = new Uint8Array([...]); // Your MARC21 binary data
const result = parseMarcRecord(buffer);

if (result.record) {
  // Extract bibliographic metadata
  console.log('Title:', title(result.record));
  console.log('Author:', author(result.record));
  console.log('ISBNs:', isbn(result.record));
  console.log('Subjects:', subjects(result.record));
}

// Check for parsing warnings
if (result.warnings.length > 0) {
  console.warn('Parsing warnings:', result.warnings);
}
```

## Why marc-ts?

Existing JavaScript/TypeScript MARC libraries are either:
- Node.js-only (using streams, fs, Buffer APIs)
- Class-based OOP patterns (not TypeScript-idiomatic)
- Mutable APIs (following Perl's design)
- Lacking Perl MARC::Record familiarity (steep learning curve)

**marc-ts** fills this gap by combining:
- Perl MARC::Record's familiar API
- TypeScript's type safety and functional patterns
- Universal browser/Node.js compatibility
- Immutable operations for safer code

## Core Concepts

### Immutability

Unlike Perl MARC::Record which mutates records in place, **marc-ts** returns new objects:

```typescript
// Perl (mutable):
// $record->append_fields($field); // Modifies $record

// TypeScript (immutable):
const updated = appendField(record, field); // record is unchanged
```

This prevents accidental mutations and makes code easier to reason about.

### Functional API

Instead of methods on objects, **marc-ts** uses pure functions:

```typescript
// Perl: $record->title()
// TypeScript: title(record)

// Perl: $record->field('245')
// TypeScript: getField(record, '245')
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
  strict: false, // If true, throw errors instead of collecting warnings
  maxWarnings: 100, // Maximum warnings to collect
});

if (result.record) {
  // Successfully parsed
} else {
  // Parsing failed, check result.warnings
}
```

#### `parseMarcRecordStrict(buffer): MarcRecord`

Convenience wrapper for strict parsing (throws on errors).

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

## Migrating from Perl MARC::Record

See [PERL_MIGRATION.md](./PERL_MIGRATION.md) for a comprehensive migration guide.

## Examples

See the [examples/](./examples/) directory for more examples:
- [basic-usage.ts](./examples/basic-usage.ts) - Common usage patterns
- [browser.html](./examples/browser.html) - Browser integration

## License

MIT © [Your Name]

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Related Projects

- [Perl MARC::Record](https://metacpan.org/pod/MARC::Record) - Original Perl library
- [@natlibfi/marc-record](https://github.com/NatLibFi/marc-record-js) - Node.js-only MARC library
- [marcjs](https://github.com/fredericd/marcjs) - Stream-based Node.js MARC library
