import { describe, it, expect } from 'vitest';
import { serializeMarcRecord } from '../serializer';
import type { MarcRecord } from '../types';

describe('serializeMarcRecord', () => {
  it('throws when serialized record length exceeds the MARC leader limit', () => {
    const record: MarcRecord = {
      leader: '00000nam  2200000   4500',
      fields: [{ tag: '001', data: 'x'.repeat(100_000) }],
    };

    expect(() => serializeMarcRecord(record)).toThrow(
      'Record length 100041 exceeds maximum (99999)'
    );
  });
});
