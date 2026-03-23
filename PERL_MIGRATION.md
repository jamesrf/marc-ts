# Migrating from Perl MARC::Record to marc-ts

This guide helps Perl MARC::Record users transition to **marc-ts** for TypeScript/JavaScript projects.

## Table of Contents

- [Key Differences](#key-differences)
- [Method Equivalents](#method-equivalents)
- [Complete Examples](#complete-examples)
- [Common Patterns](#common-patterns)

## Key Differences

### 1. Functional vs. Object-Oriented

**Perl MARC::Record** uses object-oriented methods:

```perl
my $title = $record->title();
my $author = $record->author();
```

**marc-ts** uses functional programming:

```typescript
const titleText = title(record);
const authorName = author(record);
```

**Why the change?** Functional programming is more idiomatic in TypeScript and allows for better tree-shaking, immutability, and composability.

### 2. Immutable vs. Mutable

**Perl MARC::Record** mutates records in place:

```perl
$record->append_fields($field);  # Modifies $record directly
$record->delete_fields('650');   # Modifies $record directly
```

**marc-ts** returns new records:

```typescript
const updated = appendField(record, field);  // record is unchanged
const filtered = removeFields(record, '650'); // record is unchanged
```

**Why the change?** Immutability prevents accidental bugs and makes code easier to reason about, especially in React/modern web frameworks.

### 3. Error Handling

**Perl MARC::Record** uses warnings and the `$MARC::Record::ERROR` variable:

```perl
use MARC::Batch;

my $batch = MARC::Batch->new('USMARC', $filename);
$batch->strict_off(); # Non-strict mode (default)

while (my $record = $batch->next()) {
  # Process record
  if ($MARC::Record::ERROR) {
    warn "Error: $MARC::Record::ERROR";
  }
}
```

**marc-ts** returns warnings in the parse result:

```typescript
const result = parseMarcRecord(buffer, {
  strict: false, // Non-strict mode (default, matches Perl)
  maxWarnings: 100,
});

if (result.record) {
  // Process record
  if (result.warnings.length > 0) {
    console.warn('Warnings:', result.warnings);
  }
}
```

## Method Equivalents

### Record-Level Methods

| Perl MARC::Record | marc-ts | Notes |
|-------------------|---------|-------|
| `MARC::Record->new()` | Create object directly | No constructor needed |
| `MARC::Record->new_from_usmarc($data)` | `parseMarcRecord(buffer)` | Returns `ParseResult` |
| `$record->as_usmarc()` | `serializeMarcRecord(record)` | Returns `Uint8Array` |
| `$record->leader()` | `record.leader` | Direct property access |
| `$record->clone()` | `cloneRecord(record)` | Immutable |

### Convenience Accessors

| Perl MARC::Record | marc-ts | Field(s) |
|-------------------|---------|----------|
| `$record->title()` | `title(record)` | 245 $a$b |
| `$record->author()` | `author(record)` | 100/110 $a |
| `$record->edition()` | `edition(record)` | 250 $a |
| `$record->publisher()` | `publisher(record)` | 260/264 $b |
| `$record->publication_date()` | `publicationDate(record)` | 260/264 $c |
| `$record->isbn()` | `isbn(record)` | 020 $a |
| `$record->issn()` | `issn(record)` | 022 $a |
| `$record->lccn()` | `lccn(record)` | 010 $a |
| *(custom)* | `subjects(record)` | 6XX $a |
| *(custom)* | `seriesStatement(record)` | 490 $a |

### Field Access

| Perl MARC::Record | marc-ts | Notes |
|-------------------|---------|-------|
| `$record->field('245')` | `getField(record, '245')` | First occurrence |
| `$record->fields()` | `record.fields` | All fields |
| `$record->field('6..')` | `getFieldsByPattern(record, '6..')` | Wildcard matching |
| `$field->tag()` | `field.tag` | Direct property access |
| `$field->indicator(1)` | `field.indicator1` | Data fields only |
| `$field->indicator(2)` | `field.indicator2` | Data fields only |

### Subfield Access

| Perl MARC::Record | marc-ts | Notes |
|-------------------|---------|-------|
| `$field->subfield('a')` | `getSubfield(field, 'a')` | First occurrence |
| `$field->subfields()` | `getAllSubfields(field)` | Returns `{code, value}[]` |
| `$field->subfield('a', 'b', 'c')` | *(no equivalent)* | Use multiple `getSubfield` calls |

### Field Manipulation

| Perl MARC::Record | marc-ts | Notes |
|-------------------|---------|-------|
| `$record->append_fields($field)` | `appendField(record, field)` | Immutable |
| `$record->insert_fields_before('600', $f)` | `insertFieldBefore(record, '600', f)` | Immutable |
| `$record->insert_fields_after('600', $f)` | `insertFieldAfter(record, '600', f)` | Immutable |
| `$record->insert_fields_ordered($f)` | `insertGroupedField(record, f)` | Immutable |
| `$record->delete_fields('650')` | `removeFields(record, '650')` | Immutable |
| `$record->delete_field($field)` | `removeField(record, field)` | Immutable |
| `$field->add_subfields('x' => 'Value')` | `addSubfield(field, 'x', 'Value')` | Immutable |
| `$field->delete_subfield('x')` | `removeSubfield(field, 'x')` | Immutable |
| `$field->update('a' => 'New Value')` | `replaceSubfield(field, 'a', 'New Value')` | Immutable |

## Complete Examples

### Example 1: Parsing a MARC File

**Perl:**

```perl
use MARC::Batch;

my $batch = MARC::Batch->new('USMARC', 'records.mrc');
$batch->strict_off();

while (my $record = $batch->next()) {
  print "Title: ", $record->title(), "\n";
  print "Author: ", $record->author(), "\n";

  # Get all 650 fields
  my @subjects = $record->field('650');
  foreach my $field (@subjects) {
    my $heading = $field->subfield('a');
    print "Subject: $heading\n" if $heading;
  }
}
```

**TypeScript (Node.js):**

```typescript
import { readFileSync } from 'fs';
import { parseMarcRecord, title, author, getFields, getSubfield } from 'marc-ts';
import { isDataField } from 'marc-ts';

const buffer = readFileSync('records.mrc');

// Parse all records (for multi-record files, split by record terminator)
const records = splitMarcRecords(buffer); // You'll need to implement this

for (const recordBuffer of records) {
  const result = parseMarcRecord(recordBuffer);

  if (!result.record) continue;

  console.log('Title:', title(result.record));
  console.log('Author:', author(result.record));

  // Get all 650 fields
  const subjectFields = getFields(result.record, '650');
  for (const field of subjectFields) {
    if (isDataField(field)) {
      const heading = getSubfield(field, 'a');
      if (heading) console.log('Subject:', heading);
    }
  }
}
```

### Example 2: Creating a New Record

**Perl:**

```perl
use MARC::Record;
use MARC::Field;

my $record = MARC::Record->new();
$record->leader('00000nam  2200000   4500');

# Add control field
my $field001 = MARC::Field->new('001', 'test123');
$record->append_fields($field001);

# Add data field
my $field245 = MARC::Field->new(
  '245', '1', '0',
  'a' => 'The Title /',
  'c' => 'Author Name.'
);
$record->append_fields($field245);

# Serialize
my $marc_data = $record->as_usmarc();
```

**TypeScript:**

```typescript
import { serializeMarcRecord } from 'marc-ts';
import type { MarcRecord, ControlField, DataField } from 'marc-ts';

const record: MarcRecord = {
  leader: '00000nam  2200000   4500',
  fields: [],
};

// Add control field
const field001: ControlField = { tag: '001', data: 'test123' };
const withControlField = appendField(record, field001);

// Add data field
const field245: DataField = {
  tag: '245',
  indicator1: '1',
  indicator2: '0',
  subfields: [
    { code: 'a', value: 'The Title /' },
    { code: 'c', value: 'Author Name.' },
  ],
};
const finalRecord = appendField(withControlField, field245);

// Serialize
const marcData = serializeMarcRecord(finalRecord);
```

### Example 3: Modifying Records

**Perl:**

```perl
# Add a new subject field
my $new_subject = MARC::Field->new(
  '650', ' ', '0',
  'a' => 'New Subject'
);
$record->append_fields($new_subject);

# Remove all 650 fields
$record->delete_fields('650');

# Update title
my $title_field = $record->field('245');
if ($title_field) {
  $title_field->update('a' => 'New Title /');
}
```

**TypeScript:**

```typescript
import { appendField, removeFields, getField, replaceSubfield } from 'marc-ts';
import { isDataField } from 'marc-ts';

// Add a new subject field
const newSubject: DataField = {
  tag: '650',
  indicator1: ' ',
  indicator2: '0',
  subfields: [{ code: 'a', value: 'New Subject' }],
};
let updated = appendField(record, newSubject);

// Remove all 650 fields
updated = removeFields(updated, '650');

// Update title
const titleField = getField(updated, '245');
if (titleField && isDataField(titleField)) {
  const updatedField = replaceSubfield(titleField, 'a', 'New Title /');

  // Replace the field in the record
  updated = {
    ...updated,
    fields: updated.fields.map((f) => (f === titleField ? updatedField : f)),
  };
}
```

### Example 4: Wildcard Querying

**Perl:**

```perl
# Get all 6XX subject fields
my @subject_fields = $record->field('6..');

foreach my $field (@subject_fields) {
  print "Tag: ", $field->tag(), "\n";
  my $heading = $field->subfield('a');
  print "Heading: $heading\n" if $heading;
}
```

**TypeScript:**

```typescript
import { getFieldsByPattern, getSubfield } from 'marc-ts';
import { isDataField } from 'marc-ts';

// Get all 6XX subject fields
const subjectFields = getFieldsByPattern(record, '6..');

for (const field of subjectFields) {
  console.log('Tag:', field.tag);
  if (isDataField(field)) {
    const heading = getSubfield(field, 'a');
    if (heading) console.log('Heading:', heading);
  }
}
```

## Common Patterns

### Pattern 1: Checking if a Field Exists

**Perl:**

```perl
if (my $field = $record->field('245')) {
  # Field exists
}
```

**TypeScript:**

```typescript
const field = getField(record, '245');
if (field) {
  // Field exists
}
```

### Pattern 2: Iterating Over Repeatable Fields

**Perl:**

```perl
foreach my $field ($record->field('650')) {
  my $heading = $field->subfield('a');
  print "$heading\n" if $heading;
}
```

**TypeScript:**

```typescript
for (const field of getFields(record, '650')) {
  if (isDataField(field)) {
    const heading = getSubfield(field, 'a');
    if (heading) console.log(heading);
  }
}
```

### Pattern 3: Type Guards for Control vs. Data Fields

**TypeScript only:**

```typescript
import { isControlField, isDataField } from 'marc-ts';

const field = getField(record, '001');

if (isControlField(field)) {
  console.log('Control field data:', field.data);
} else if (isDataField(field)) {
  console.log('Data field indicators:', field.indicator1, field.indicator2);
}
```

### Pattern 4: Building Records Incrementally

**Perl:**

```perl
my $record = MARC::Record->new();
$record->append_fields($field1);
$record->append_fields($field2);
$record->append_fields($field3);
```

**TypeScript:**

```typescript
let record: MarcRecord = {
  leader: '00000nam  2200000   4500',
  fields: [],
};

record = appendField(record, field1);
record = appendField(record, field2);
record = appendField(record, field3);
```

### Pattern 5: Extracting All Values from Repeatable Subfields

**Perl:**

```perl
my @subdivisions = $field->subfield('x'); # Returns array
```

**TypeScript:**

```typescript
const subdivisions = getSubfields(field, 'x'); // Returns string[]
```

## Tips for Migration

1. **Use Type Guards**: Always use `isControlField()` and `isDataField()` to narrow types before accessing field-specific properties.

2. **Embrace Immutability**: Instead of modifying records in place, build a transformation pipeline:
   ```typescript
   const processed = removeFields(
     appendField(
       cloneRecord(original),
       newField
     ),
     '999'
   );
   ```

3. **Leverage TypeScript**: Enable strict mode in `tsconfig.json` to catch errors at compile time.

4. **Handle Warnings**: Always check `result.warnings` after parsing to catch malformed records.

5. **Test with Real Data**: MARC records are often imperfect. Test with real-world data, not just idealized examples.

## Performance Considerations

- **Perl MARC::Record** can mutate records in place, which is fast but risky
- **marc-ts** creates new objects for immutability, which is slightly slower but safer
- For large batches, consider processing in chunks to manage memory

## Further Reading

- [marc-ts README](./README.md) - Full API documentation
- [Perl MARC::Record Documentation](https://metacpan.org/pod/MARC::Record)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
