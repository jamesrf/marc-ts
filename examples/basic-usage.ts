/**
 * Basic Usage Examples for marc-ts
 *
 * This file demonstrates common usage patterns for the marc-ts library.
 */

import {
  parseMarcRecord,
  serializeMarcRecord,
  title,
  author,
  isbn,
  subjects,
  publisher,
  publicationDate,
  appendField,
  insertGroupedField,
  getField,
  getFields,
  getSubfield,
  getFieldsByPattern,
  cloneRecord,
  recordsEqual,
} from '../src/index';
import type { MarcRecord, DataField } from '../src/types';
import { isDataField } from '../src/types';

// ============================================================================
// Example 1: Creating and Serializing a MARC Record
// ============================================================================

function example1_createRecord(): void {
  console.log('\n=== Example 1: Creating a MARC Record ===\n');

  // Create a MARC record from scratch
  const record: MarcRecord = {
    leader: '00000nam  2200000   4500',
    fields: [
      // Control fields
      { tag: '001', data: 'ocm12345678' },
      { tag: '003', data: 'OCoLC' },
      { tag: '008', data: '510315s1951    mau           000 1 eng  ' },

      // Main author
      {
        tag: '100',
        indicator1: '1',
        indicator2: ' ',
        subfields: [{ code: 'a', value: 'Salinger, J. D.' }],
      },

      // Title
      {
        tag: '245',
        indicator1: '1',
        indicator2: '4',
        subfields: [
          { code: 'a', value: 'The Catcher in the Rye /' },
          { code: 'c', value: 'J.D. Salinger.' },
        ],
      },

      // Publication info
      {
        tag: '260',
        indicator1: ' ',
        indicator2: ' ',
        subfields: [
          { code: 'a', value: 'Boston :' },
          { code: 'b', value: 'Little, Brown,' },
          { code: 'c', value: '1951.' },
        ],
      },

      // Physical description
      {
        tag: '300',
        indicator1: ' ',
        indicator2: ' ',
        subfields: [
          { code: 'a', value: '277 p. ;' },
          { code: 'c', value: '21 cm.' },
        ],
      },

      // Subject headings
      {
        tag: '650',
        indicator1: ' ',
        indicator2: '0',
        subfields: [{ code: 'a', value: 'Coming of age' }],
      },
      {
        tag: '650',
        indicator1: ' ',
        indicator2: '0',
        subfields: [{ code: 'a', value: 'Fiction' }],
      },
    ],
  };

  console.log('Created MARC record with', record.fields.length, 'fields');

  // Serialize to ISO2709 binary format
  const buffer = serializeMarcRecord(record);
  console.log('Serialized to', buffer.length, 'bytes');

  // Parse it back
  const result = parseMarcRecord(buffer);
  if (result.record) {
    console.log('Roundtrip successful!');
    console.log('  Warnings:', result.warnings.length);
  }
}

// ============================================================================
// Example 2: Extracting Bibliographic Metadata
// ============================================================================

function example2_extractMetadata(): void {
  console.log('\n=== Example 2: Extracting Bibliographic Metadata ===\n');

  // Create a sample record
  const record: MarcRecord = {
    leader: '00000nam  2200000   4500',
    fields: [
      { tag: '001', data: 'test123' },
      {
        tag: '010',
        indicator1: ' ',
        indicator2: ' ',
        subfields: [{ code: 'a', value: '   50011915 ' }],
      },
      {
        tag: '020',
        indicator1: ' ',
        indicator2: ' ',
        subfields: [{ code: 'a', value: '978-0-316-76948-0' }],
      },
      {
        tag: '020',
        indicator1: ' ',
        indicator2: ' ',
        subfields: [{ code: 'a', value: '0-316-76948-7' }],
      },
      {
        tag: '100',
        indicator1: '1',
        indicator2: ' ',
        subfields: [{ code: 'a', value: 'Salinger, J. D.' }],
      },
      {
        tag: '245',
        indicator1: '1',
        indicator2: '4',
        subfields: [
          { code: 'a', value: 'The Catcher in the Rye /' },
          { code: 'c', value: 'J.D. Salinger.' },
        ],
      },
      {
        tag: '260',
        indicator1: ' ',
        indicator2: ' ',
        subfields: [
          { code: 'b', value: 'Little, Brown,' },
          { code: 'c', value: '1951.' },
        ],
      },
      {
        tag: '650',
        indicator1: ' ',
        indicator2: '0',
        subfields: [{ code: 'a', value: 'Coming of age' }],
      },
      {
        tag: '650',
        indicator1: ' ',
        indicator2: '0',
        subfields: [{ code: 'a', value: 'Fiction' }],
      },
    ],
  };

  // Use convenience functions to extract metadata
  console.log('Title:', title(record));
  console.log('Author:', author(record));
  console.log('Publisher:', publisher(record));
  console.log('Publication Date:', publicationDate(record));
  console.log('ISBNs:', isbn(record));
  console.log('Subjects:', subjects(record));
}

// ============================================================================
// Example 3: Adding and Removing Fields (Immutable Operations)
// ============================================================================

function example3_modifyFields(): void {
  console.log('\n=== Example 3: Adding and Removing Fields ===\n');

  let record: MarcRecord = {
    leader: '00000nam  2200000   4500',
    fields: [
      { tag: '001', data: 'test123' },
      {
        tag: '245',
        indicator1: '1',
        indicator2: '0',
        subfields: [{ code: 'a', value: 'Original Title' }],
      },
    ],
  };

  console.log('Original record has', record.fields.length, 'fields');

  // Add a new subject field
  const newSubject: DataField = {
    tag: '650',
    indicator1: ' ',
    indicator2: '0',
    subfields: [{ code: 'a', value: 'New Subject' }],
  };

  const withSubject = appendField(record, newSubject);
  console.log('After append:', withSubject.fields.length, 'fields');
  console.log('Original unchanged:', record.fields.length, 'fields (immutability!)');

  // Add another field maintaining MARC order
  const authorField: DataField = {
    tag: '100',
    indicator1: '1',
    indicator2: ' ',
    subfields: [{ code: 'a', value: 'Author Name' }],
  };

  const withAuthor = insertGroupedField(withSubject, authorField);
  console.log('After grouped insert:', withAuthor.fields.length, 'fields');
  console.log('Field order:', withAuthor.fields.map((f) => f.tag).join(', '));
  // Should be: 001, 100, 245, 650 (MARC block order)
}

// ============================================================================
// Example 4: Wildcard Field Querying
// ============================================================================

function example4_wildcardQuery(): void {
  console.log('\n=== Example 4: Wildcard Field Querying ===\n');

  const record: MarcRecord = {
    leader: '00000nam  2200000   4500',
    fields: [
      { tag: '001', data: 'test' },
      {
        tag: '100',
        indicator1: '1',
        indicator2: ' ',
        subfields: [{ code: 'a', value: 'Main Author' }],
      },
      {
        tag: '245',
        indicator1: '1',
        indicator2: '0',
        subfields: [{ code: 'a', value: 'Title' }],
      },
      {
        tag: '600',
        indicator1: '1',
        indicator2: '0',
        subfields: [{ code: 'a', value: 'Subject Person' }],
      },
      {
        tag: '650',
        indicator1: ' ',
        indicator2: '0',
        subfields: [{ code: 'a', value: 'Topic Subject' }],
      },
      {
        tag: '651',
        indicator1: ' ',
        indicator2: '0',
        subfields: [{ code: 'a', value: 'Geographic Subject' }],
      },
      {
        tag: '700',
        indicator1: '1',
        indicator2: ' ',
        subfields: [{ code: 'a', value: 'Added Entry' }],
      },
    ],
  };

  // Get all 6XX subject fields
  const subjectFields = getFieldsByPattern(record, '6..');
  console.log(`Found ${subjectFields.length} subject fields (6XX):`);
  for (const field of subjectFields) {
    if (isDataField(field)) {
      const heading = getSubfield(field, 'a');
      console.log(`  ${field.tag} $a: ${heading}`);
    }
  }

  // Get all 7XX added entry fields
  const addedEntries = getFieldsByPattern(record, '7XX');
  console.log(`\nFound ${addedEntries.length} added entry fields (7XX):`);
  for (const field of addedEntries) {
    console.log(`  ${field.tag}`);
  }

  // Get all X00 fields (100, 600, 700, etc.)
  const x00Fields = getFieldsByPattern(record, 'X00');
  console.log(`\nFound ${x00Fields.length} X00 fields:`);
  for (const field of x00Fields) {
    console.log(`  ${field.tag}`);
  }
}

// ============================================================================
// Example 5: Cloning and Equality
// ============================================================================

function example5_cloneAndEquals(): void {
  console.log('\n=== Example 5: Cloning and Equality ===\n');

  const original: MarcRecord = {
    leader: '00000nam  2200000   4500',
    fields: [
      { tag: '001', data: 'test123' },
      {
        tag: '245',
        indicator1: '1',
        indicator2: '0',
        subfields: [{ code: 'a', value: 'Title' }],
      },
    ],
  };

  // Clone the record
  const clone = cloneRecord(original);
  console.log('Records equal?', recordsEqual(original, clone)); // true

  // Modify the clone
  const modified = appendField(clone, {
    tag: '650',
    indicator1: ' ',
    indicator2: '0',
    subfields: [{ code: 'a', value: 'Subject' }],
  });

  console.log('Original unchanged:', original.fields.length, 'fields');
  console.log('Modified has:', modified.fields.length, 'fields');
  console.log('Still equal?', recordsEqual(original, modified)); // false
}

// ============================================================================
// Example 6: Working with Subfields
// ============================================================================

function example6_subfields(): void {
  console.log('\n=== Example 6: Working with Subfields ===\n');

  const record: MarcRecord = {
    leader: '00000nam  2200000   4500',
    fields: [
      {
        tag: '650',
        indicator1: ' ',
        indicator2: '0',
        subfields: [
          { code: 'a', value: 'Main Subject' },
          { code: 'x', value: 'Subdivision 1' },
          { code: 'x', value: 'Subdivision 2' },
          { code: 'v', value: 'Form subdivision' },
        ],
      },
    ],
  };

  const field = getField(record, '650');
  if (field && isDataField(field)) {
    console.log('Field 650 indicators:', field.indicator1, field.indicator2);

    // Get first subfield $a
    const mainHeading = getSubfield(field, 'a');
    console.log('Main heading ($a):', mainHeading);

    // Get all $x subfields (repeatable)
    const subdivisions = field.subfields.filter((sf) => sf.code === 'x').map((sf) => sf.value);
    console.log('Subdivisions ($x):', subdivisions);

    // Iterate over all subfields
    console.log('All subfields:');
    for (const sf of field.subfields) {
      console.log(`  $${sf.code}: ${sf.value}`);
    }
  }
}

// ============================================================================
// Run all examples
// ============================================================================

function main(): void {
  console.log('===== marc-ts Basic Usage Examples =====');

  example1_createRecord();
  example2_extractMetadata();
  example3_modifyFields();
  example4_wildcardQuery();
  example5_cloneAndEquals();
  example6_subfields();

  console.log('\n===== All examples completed successfully! =====\n');
}

// Run if executed directly
if (require.main === module) {
  main();
}
