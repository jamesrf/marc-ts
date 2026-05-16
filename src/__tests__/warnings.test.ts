import { describe, it, expect } from 'vitest';
import { createWarning } from '../warnings';

describe('createWarning', () => {
  it('creates a warning with only required fields', () => {
    expect(createWarning('invalid_leader', 'Bad leader')).toEqual({
      type: 'invalid_leader',
      message: 'Bad leader',
      position: undefined,
      tag: undefined,
    });
  });

  it('creates a warning with position and tag context', () => {
    expect(createWarning('invalid_field', 'Bad field', 42, '245')).toEqual({
      type: 'invalid_field',
      message: 'Bad field',
      position: 42,
      tag: '245',
    });
  });
});
