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
  getSubfield,
  getFieldsByPattern,
  cloneRecord,
  recordsEqual,
} from '../src/index';
import type { MarcRecord, DataField } from '../src/types';
import { isDataField } from '../src/types';
import { parseMarcXml, parseMarcXmlRecord, serializeMarcXml, serializeMarcXmlRecord } from '../src/marcxml';
import { parseMarcJson, serializeMarcJson, serializeMarcJsonString } from '../src/marcjson';

// ============================================================================
// Example 1: Creating and Serializing a MARC Record
// ============================================================================

function example1_createRecord(): void {
  console.log('\n-- 1: Creating a MARC Record --');

  const record: MarcRecord = {
    leader: '00000nam  2200000   4500',
    fields: [
      { tag: '001', data: 'ocm12345678' },
      { tag: '003', data: 'OCoLC' },
      { tag: '008', data: '510315s1951    mau           000 1 eng  ' },
      { tag: '100', indicator1: '1', indicator2: ' ', subfields: [{ code: 'a', value: 'Salinger, J. D.' }] },
      {
        tag: '245', indicator1: '1', indicator2: '4',
        subfields: [{ code: 'a', value: 'The Catcher in the Rye /' }, { code: 'c', value: 'J.D. Salinger.' }],
      },
      {
        tag: '260', indicator1: ' ', indicator2: ' ',
        subfields: [{ code: 'a', value: 'Boston :' }, { code: 'b', value: 'Little, Brown,' }, { code: 'c', value: '1951.' }],
      },
      {
        tag: '300', indicator1: ' ', indicator2: ' ',
        subfields: [{ code: 'a', value: '277 p. ;' }, { code: 'c', value: '21 cm.' }],
      },
      { tag: '650', indicator1: ' ', indicator2: '0', subfields: [{ code: 'a', value: 'Coming of age' }] },
      { tag: '650', indicator1: ' ', indicator2: '0', subfields: [{ code: 'a', value: 'Fiction' }] },
    ],
  };

  const buffer = serializeMarcRecord(record);
  const result = parseMarcRecord(buffer);
  console.log(`  ${record.fields.length} fields → ${buffer.length} bytes → roundtrip ${result.record ? 'ok' : 'FAILED'} (${result.warnings.length} warnings)`);
}

// ============================================================================
// Example 2: Extracting Bibliographic Metadata
// ============================================================================

function example2_extractMetadata(): void {
  console.log('\n-- 2: Extracting Bibliographic Metadata --');

  const record: MarcRecord = {
    leader: '00000nam  2200000   4500',
    fields: [
      { tag: '001', data: 'test123' },
      { tag: '010', indicator1: ' ', indicator2: ' ', subfields: [{ code: 'a', value: '   50011915 ' }] },
      { tag: '020', indicator1: ' ', indicator2: ' ', subfields: [{ code: 'a', value: '978-0-316-76948-0' }] },
      { tag: '020', indicator1: ' ', indicator2: ' ', subfields: [{ code: 'a', value: '0-316-76948-7' }] },
      { tag: '100', indicator1: '1', indicator2: ' ', subfields: [{ code: 'a', value: 'Salinger, J. D.' }] },
      {
        tag: '245', indicator1: '1', indicator2: '4',
        subfields: [{ code: 'a', value: 'The Catcher in the Rye /' }, { code: 'c', value: 'J.D. Salinger.' }],
      },
      {
        tag: '260', indicator1: ' ', indicator2: ' ',
        subfields: [{ code: 'b', value: 'Little, Brown,' }, { code: 'c', value: '1951.' }],
      },
      { tag: '650', indicator1: ' ', indicator2: '0', subfields: [{ code: 'a', value: 'Coming of age' }] },
      { tag: '650', indicator1: ' ', indicator2: '0', subfields: [{ code: 'a', value: 'Fiction' }] },
    ],
  };

  console.log(`  title="${title(record)}"  author="${author(record)}"`);
  console.log(`  publisher="${publisher(record)}"  date="${publicationDate(record)}"`);
  console.log(`  isbn=${JSON.stringify(isbn(record))}  subjects=${JSON.stringify(subjects(record))}`);
}

// ============================================================================
// Example 3: Adding and Removing Fields (Immutable Operations)
// ============================================================================

function example3_modifyFields(): void {
  console.log('\n-- 3: Adding and Removing Fields --');

  const record: MarcRecord = {
    leader: '00000nam  2200000   4500',
    fields: [
      { tag: '001', data: 'test123' },
      { tag: '245', indicator1: '1', indicator2: '0', subfields: [{ code: 'a', value: 'Original Title' }] },
    ],
  };

  const newSubject: DataField = {
    tag: '650', indicator1: ' ', indicator2: '0',
    subfields: [{ code: 'a', value: 'New Subject' }],
  };
  const withSubject = appendField(record, newSubject);
  console.log(`  original=${record.fields.length} fields  after append=${withSubject.fields.length} fields  (original unchanged)`);

  const authorField: DataField = {
    tag: '100', indicator1: '1', indicator2: ' ',
    subfields: [{ code: 'a', value: 'Author Name' }],
  };
  const withAuthor = insertGroupedField(withSubject, authorField);
  console.log(`  after grouped insert: [${withAuthor.fields.map((f) => f.tag).join(', ')}]`);
}

// ============================================================================
// Example 4: Wildcard Field Querying
// ============================================================================

function example4_wildcardQuery(): void {
  console.log('\n-- 4: Wildcard Field Querying --');

  const record: MarcRecord = {
    leader: '00000nam  2200000   4500',
    fields: [
      { tag: '001', data: 'test' },
      { tag: '100', indicator1: '1', indicator2: ' ', subfields: [{ code: 'a', value: 'Main Author' }] },
      { tag: '245', indicator1: '1', indicator2: '0', subfields: [{ code: 'a', value: 'Title' }] },
      { tag: '600', indicator1: '1', indicator2: '0', subfields: [{ code: 'a', value: 'Subject Person' }] },
      { tag: '650', indicator1: ' ', indicator2: '0', subfields: [{ code: 'a', value: 'Topic Subject' }] },
      { tag: '651', indicator1: ' ', indicator2: '0', subfields: [{ code: 'a', value: 'Geographic Subject' }] },
      { tag: '700', indicator1: '1', indicator2: ' ', subfields: [{ code: 'a', value: 'Added Entry' }] },
    ],
  };

  const subjectFields = getFieldsByPattern(record, '6..');
  const headings = subjectFields
    .filter(isDataField)
    .map((f) => `${f.tag}="${getSubfield(f, 'a')}"`)
    .join('  ');
  console.log(`  6.. (${subjectFields.length}): ${headings}`);

  const addedEntries = getFieldsByPattern(record, '7XX');
  console.log(`  7XX (${addedEntries.length}): ${addedEntries.map((f) => f.tag).join(', ')}`);

  const x00Fields = getFieldsByPattern(record, 'X00');
  console.log(`  X00 (${x00Fields.length}): ${x00Fields.map((f) => f.tag).join(', ')}`);
}

// ============================================================================
// Example 5: Cloning and Equality
// ============================================================================

function example5_cloneAndEquals(): void {
  console.log('\n-- 5: Cloning and Equality --');

  const original: MarcRecord = {
    leader: '00000nam  2200000   4500',
    fields: [
      { tag: '001', data: 'test123' },
      { tag: '245', indicator1: '1', indicator2: '0', subfields: [{ code: 'a', value: 'Title' }] },
    ],
  };

  const clone = cloneRecord(original);
  const modified = appendField(clone, {
    tag: '650', indicator1: ' ', indicator2: '0',
    subfields: [{ code: 'a', value: 'Subject' }],
  });

  console.log(`  equal(original, clone)=${recordsEqual(original, clone)}  equal(original, modified)=${recordsEqual(original, modified)}`);
  console.log(`  original=${original.fields.length} fields  modified=${modified.fields.length} fields`);
}

// ============================================================================
// Example 6: Working with Subfields
// ============================================================================

function example6_subfields(): void {
  console.log('\n-- 6: Working with Subfields --');

  const record: MarcRecord = {
    leader: '00000nam  2200000   4500',
    fields: [
      {
        tag: '650', indicator1: ' ', indicator2: '0',
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
    const subdivisions = field.subfields.filter((sf) => sf.code === 'x').map((sf) => sf.value);
    console.log(`  $a="${getSubfield(field, 'a')}"  $x=${JSON.stringify(subdivisions)}`);
    console.log(`  all: ${field.subfields.map((sf) => `$${sf.code}="${sf.value}"`).join('  ')}`);
  }
}

// ============================================================================
// Example 7: MARCXML
// ============================================================================

function example7_marcXml(): void {
  console.log('\n-- 7: MARCXML --');

  const record: MarcRecord = {
    leader: '00000nam a2200000   4500',
    fields: [
      { tag: '001', data: 'hobbit001' },
      { tag: '100', indicator1: '1', indicator2: ' ', subfields: [{ code: 'a', value: 'Tolkien, J. R. R.' }] },
      {
        tag: '245', indicator1: '1', indicator2: '4',
        subfields: [{ code: 'a', value: 'The Hobbit /' }, { code: 'c', value: 'J.R.R. Tolkien.' }],
      },
      { tag: '650', indicator1: ' ', indicator2: '0', subfields: [{ code: 'a', value: 'Fantasy fiction' }] },
    ],
  };

  // Single <record> element roundtrip
  const recordXml = serializeMarcXmlRecord(record);
  const parsedSingle = parseMarcXmlRecord(recordXml);
  console.log(`  <record> ${recordXml.length} chars → roundtrip title="${title(parsedSingle)}"`);

  // Full <collection> roundtrip
  const collectionXml = serializeMarcXml([record]);
  const [parsedCollection] = parseMarcXml(collectionXml);
  console.log(`  <collection> ${collectionXml.length} chars → roundtrip author="${author(parsedCollection)}"`);
}

// ============================================================================
// Example 8: MARC-in-JSON
// ============================================================================

function example8_marcJson(): void {
  console.log('\n-- 8: MARC-in-JSON --');

  const jsonString = JSON.stringify({
    leader: '00000nam a2200000   4500',
    fields: [
      { '001': 'json001' },
      { '100': { subfields: [{ a: 'Tolkien, J. R. R.' }], ind1: '1', ind2: ' ' } },
      { '245': { subfields: [{ a: 'The Hobbit /' }, { c: 'J.R.R. Tolkien.' }], ind1: '1', ind2: '4' } },
      { '650': { subfields: [{ a: 'Fantasy fiction' }], ind1: ' ', ind2: '0' } },
    ],
  });

  // Parse from string
  const record = parseMarcJson(jsonString);
  console.log(`  from string: title="${title(record)}"  author="${author(record)}"`);

  // Serialize to object, then parse back
  const obj = serializeMarcJson(record);
  const recordFromObj = parseMarcJson(obj);
  console.log(`  from object: leader="${obj.leader}"  fields=${obj.fields.length}  roundtrip title="${title(recordFromObj)}"`);

  // Serialize to JSON string
  const roundtrip = serializeMarcJsonString(record);
  console.log(`  JSON string: ${roundtrip.length} chars`);
}

// ============================================================================
// Example 9: MARC-8 Encoding
// ============================================================================

function example9_marc8(): void {
  console.log('\n-- 9: MARC-8 Encoding --');

  const record: MarcRecord = {
    leader: '00000nam  2200000   4500',
    fields: [
      { tag: '001', data: 'marc8test' },
      { tag: '100', indicator1: '1', indicator2: ' ', subfields: [{ code: 'a', value: 'García Márquez, Gabriel,' }] },
      { tag: '245', indicator1: '1', indicator2: '0', subfields: [{ code: 'a', value: 'Cien años de soledad /' }] },
    ],
  };

  // MARC-8: leader byte 9 = ' '; ASCII + ANSEL Latin supported, others → '?'
  const marc8Buffer = serializeMarcRecord(record, { encoding: 'marc8' });
  const marc8Result = parseMarcRecord(marc8Buffer);
  console.log(`  marc8: ${marc8Buffer.length} bytes  byte9='${String.fromCharCode(marc8Buffer[9])}'  decoded author="${marc8Result.record ? author(marc8Result.record) : 'FAILED'}"`);

  // UTF-8: leader byte 9 = 'a'
  const utf8Buffer = serializeMarcRecord(record, { encoding: 'utf8' });
  console.log(`  utf8:  ${utf8Buffer.length} bytes  byte9='${String.fromCharCode(utf8Buffer[9])}'`);
}

// ============================================================================
// Run all examples
// ============================================================================

function main(): void {
  console.log('marc-ts examples');

  example1_createRecord();
  example2_extractMetadata();
  example3_modifyFields();
  example4_wildcardQuery();
  example5_cloneAndEquals();
  example6_subfields();
  example7_marcXml();
  example8_marcJson();
  example9_marc8();

  console.log('\ndone.');
}

if (require.main === module) {
  main();
}
