/**
 * Dirty-flag helpers for pull-eval cooking (§7.1).
 */

import type { OperatorInstance } from "../types/operator.js";

/** Mark all alwaysDirty operators dirty at the start of a frame. */
export function markAlwaysDirty(ops: Iterable<OperatorInstance>): void {
  for (const op of ops) {
    if (op.alwaysDirty) op.dirty = true;
  }
}

/**
 * Clear dirty after a successful cook, unless the op is alwaysDirty
 * (those stay dirty for the next frame's mark pass).
 */
export function clearDirtyAfterCook(op: OperatorInstance): void {
  if (!op.alwaysDirty) {
    op.dirty = false;
  }
}
