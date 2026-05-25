/**
 * Warning system for MARC parsing.
 * Re-exports types and provides utility functions.
 */

import type { MarcWarning, MarcWarningType } from './types';

/**
 * Create a warning object.
 *
 * @param type - The warning type
 * @param message - The warning message
 * @param position - Optional byte position in the record
 * @param tag - Optional field tag associated with the warning
 * @returns A MarcWarning object
 *
 * @example
 * ```typescript
 * const warning = createWarning(
 *   'invalid_leader',
 *   'Leader length is invalid',
 *   0,
 *   undefined
 * );
 * ```
 */
export function createWarning(
  type: MarcWarningType,
  message: string,
  position?: number,
  tag?: string
): MarcWarning {
  return { type, message, position, tag };
}
