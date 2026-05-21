/**
 * MARCXML parser and serializer.
 *
 * Supports the Library of Congress MARCXML schema:
 * http://www.loc.gov/MARC21/slim
 *
 * Parsing is done with a hand-rolled state machine — no XML library needed.
 * The MARCXML format is sufficiently regular (fixed element names, no arbitrary
 * nesting) that a full DOM parser is unnecessary.
 */

import type { MarcRecord, ControlField, DataField, Subfield } from './types';
import { isControlField } from './types';

// ─── XML entity handling ─────────────────────────────────────────────────────

const ENTITY_MAP: ReadonlyMap<string, string> = new Map([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
]);

function unescapeXml(text: string): string {
  return text.replace(/&(?:#x([0-9a-fA-F]+)|#([0-9]+)|([a-zA-Z]+));/g, (_, hex, dec, name) => {
    if (hex !== undefined) {
      const cp = parseInt(hex, 16);
      return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '�';
    }
    if (dec !== undefined) {
      const cp = parseInt(dec, 10);
      return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '�';
    }
    return ENTITY_MAP.get(name) ?? _;
  });
}

function escapeXml(text: string): string {
  return text
    // XML 1.0 forbids most C0 control characters in document text. There is no
    // valid XML 1.0 representation for them, so substitute the Unicode
    // replacement character to keep the output well-formed.
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '�')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Preserve literal CR through the XML round-trip: XML parsers normalize
    // bare \r and \r\n to \n, so we must encode CR as a numeric reference.
    .replace(/\r/g, '&#13;');
}

// ─── Minimal tokeniser ────────────────────────────────────────────────────────

interface Token {
  type: 'open' | 'close' | 'self-close' | 'text';
  /** Local name (no namespace prefix) */
  name?: string;
  attrs?: Record<string, string>;
  text?: string;
}

/**
 * Strip namespace prefix from a tag name, e.g. "marc:record" → "record".
 */
function localName(raw: string): string {
  const colon = raw.indexOf(':');
  return colon === -1 ? raw : raw.slice(colon + 1);
}

/**
 * Parse `key="value"` pairs out of an attribute string.
 */
function parseAttrs(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_:][^\s=]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrStr)) !== null) {
    const key = localName(m[1]!);
    attrs[key] = unescapeXml(m[2] ?? m[3] ?? '');
  }
  return attrs;
}

/**
 * Tokenise an XML string into a flat stream of open/close/text tokens.
 * Skips processing instructions, comments, and DOCTYPE declarations.
 * Sufficient for the well-constrained MARCXML format.
 */
function tokenise(xml: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < xml.length) {
    const ltPos = xml.indexOf('<', i);

    // Text node before next tag
    if (ltPos === -1) {
      const text = xml.slice(i).trim();
      if (text) tokens.push({ type: 'text', text: unescapeXml(xml.slice(i)) });
      break;
    }

    if (ltPos > i) {
      const raw = xml.slice(i, ltPos);
      const text = raw.trim();
      if (text) tokens.push({ type: 'text', text: unescapeXml(raw) });
    }

    const gtPos = xml.indexOf('>', ltPos);
    if (gtPos === -1) break;

    const tag = xml.slice(ltPos + 1, gtPos);

    // Skip comments, PIs, DOCTYPE
    if (tag.startsWith('!') || tag.startsWith('?')) {
      i = gtPos + 1;
      continue;
    }

    if (tag.startsWith('/')) {
      tokens.push({ type: 'close', name: localName(tag.slice(1).trim()) });
    } else if (tag.endsWith('/')) {
      const inner = tag.slice(0, -1).trim();
      const spaceIdx = inner.search(/\s/);
      const name = spaceIdx === -1 ? inner : inner.slice(0, spaceIdx);
      const attrStr = spaceIdx === -1 ? '' : inner.slice(spaceIdx);
      tokens.push({ type: 'self-close', name: localName(name), attrs: parseAttrs(attrStr) });
    } else {
      const spaceIdx = tag.search(/\s/);
      const name = spaceIdx === -1 ? tag : tag.slice(0, spaceIdx);
      const attrStr = spaceIdx === -1 ? '' : tag.slice(spaceIdx);
      tokens.push({ type: 'open', name: localName(name), attrs: parseAttrs(attrStr) });
    }

    i = gtPos + 1;
  }

  return tokens;
}

// ─── MARCXML parser ───────────────────────────────────────────────────────────

/**
 * Parse one `<record>` element's worth of tokens into a MarcRecord.
 * Mutates `pos` via the returned index.
 */
function parseRecordTokens(tokens: Token[], start: number): { record: MarcRecord; end: number } {
  let leader = '';
  const fields: (ControlField | DataField)[] = [];
  let i = start;

  while (i < tokens.length) {
    const tok = tokens[i]!;

    if (tok.type === 'close' && tok.name === 'record') {
      return { record: { leader, fields }, end: i + 1 };
    }

    if (tok.type === 'open' && tok.name === 'leader') {
      i++;
      if (i < tokens.length && tokens[i]!.type === 'text') {
        leader = tokens[i]!.text!.trim();
        i++;
      }
      // consume </leader>
      if (i < tokens.length && tokens[i]!.type === 'close') i++;
      continue;
    }

    if (tok.type === 'self-close' && tok.name === 'controlfield') {
      fields.push({ tag: tok.attrs?.['tag'] ?? '', data: '' });
      i++;
      continue;
    }

    if (tok.type === 'open' && tok.name === 'controlfield') {
      const tag = tok.attrs?.['tag'] ?? '';
      i++;
      let data = '';
      if (i < tokens.length && tokens[i]!.type === 'text') {
        data = tokens[i]!.text ?? '';
        i++;
      }
      // consume </controlfield>
      if (i < tokens.length && tokens[i]!.type === 'close') i++;
      fields.push({ tag, data });
      continue;
    }

    if (tok.type === 'self-close' && tok.name === 'datafield') {
      fields.push({
        tag: tok.attrs?.['tag'] ?? '',
        indicator1: tok.attrs?.['ind1'] ?? ' ',
        indicator2: tok.attrs?.['ind2'] ?? ' ',
        subfields: [],
      });
      i++;
      continue;
    }

    if (tok.type === 'open' && tok.name === 'datafield') {
      const tag = tok.attrs?.['tag'] ?? '';
      const indicator1 = tok.attrs?.['ind1'] ?? ' ';
      const indicator2 = tok.attrs?.['ind2'] ?? ' ';
      const subfields: Subfield[] = [];
      i++;

      while (i < tokens.length) {
        const stok = tokens[i]!;
        if (stok.type === 'close' && stok.name === 'datafield') {
          i++;
          break;
        }
        if (stok.type === 'open' && stok.name === 'subfield') {
          const code = stok.attrs?.['code'] ?? '';
          i++;
          let value = '';
          if (i < tokens.length && tokens[i]!.type === 'text') {
            value = tokens[i]!.text ?? '';
            i++;
          }
          // consume </subfield>
          if (i < tokens.length && tokens[i]!.type === 'close') i++;
          subfields.push({ code, value });
          continue;
        }
        i++;
      }

      fields.push({ tag, indicator1, indicator2, subfields });
      continue;
    }

    i++;
  }

  return { record: { leader, fields }, end: i };
}

/**
 * Parse a MARCXML string containing one `<collection>` or one bare `<record>`.
 * Returns all records found.
 */
export function parseMarcXml(xml: string): MarcRecord[] {
  const tokens = tokenise(xml);
  const records: MarcRecord[] = [];
  let i = 0;

  while (i < tokens.length) {
    const tok = tokens[i]!;
    if (tok.type === 'open' && tok.name === 'record') {
      const { record, end } = parseRecordTokens(tokens, i + 1);
      records.push(record);
      i = end;
      continue;
    }
    i++;
  }

  return records;
}

/**
 * Parse a MARCXML string expected to contain exactly one `<record>`.
 * Throws if no record is found.
 */
export function parseMarcXmlRecord(xml: string): MarcRecord {
  const records = parseMarcXml(xml);
  if (records.length === 0) throw new Error('No MARC record found in MARCXML input');
  return records[0]!;
}

// ─── MARCXML serializer ───────────────────────────────────────────────────────

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>\n';
const COLLECTION_NS = 'xmlns="http://www.loc.gov/MARC21/slim"';
const INDENT = '  ';

/**
 * Serialize a single MarcRecord to a `<record>` XML element string (no collection wrapper).
 */
export function serializeMarcXmlRecord(record: MarcRecord): string {
  const lines: string[] = [`<record ${COLLECTION_NS}>`];
  lines.push(`${INDENT}<leader>${escapeXml(record.leader)}</leader>`);

  for (const field of record.fields) {
    if (isControlField(field)) {
      lines.push(`${INDENT}<controlfield tag="${field.tag}">${escapeXml(field.data)}</controlfield>`);
    } else {
      const ind1 = field.indicator1 === ' ' ? ' ' : field.indicator1;
      const ind2 = field.indicator2 === ' ' ? ' ' : field.indicator2;
      lines.push(`${INDENT}<datafield tag="${field.tag}" ind1="${ind1}" ind2="${ind2}">`);
      for (const sf of field.subfields) {
        lines.push(
          `${INDENT}${INDENT}<subfield code="${sf.code}">${escapeXml(sf.value)}</subfield>`
        );
      }
      lines.push(`${INDENT}</datafield>`);
    }
  }

  lines.push('</record>');
  return lines.join('\n');
}

/**
 * Serialize one or more MarcRecords into a MARCXML `<collection>` document.
 */
export function serializeMarcXml(records: MarcRecord[]): string {
  const parts: string[] = [
    XML_HEADER,
    `<collection ${COLLECTION_NS}>`,
  ];

  for (const record of records) {
    // Indent each record element by one level inside <collection>
    const recordXml = serializeMarcXmlRecord(record)
      .split('\n')
      .map((line) => INDENT + line)
      .join('\n');
    parts.push(recordXml);
  }

  parts.push('</collection>');
  return parts.join('\n');
}
