/**
 * GPU crossfade concurrency cap (architecture.md §7.1).
 * wayside 1, chapel 2, cathedral 2 concurrent field/geometry fades.
 * Overflow: FIFO global queue; per-op newer arrival replaces older queued
 * arrival for that op; snap-to-clear-queue is forbidden.
 */

export type DeviceTier = "cathedral" | "chapel" | "wayside";

export function maxConcurrentGpuFades(tier: DeviceTier): number {
  switch (tier) {
    case "wayside":
      return 1;
    case "chapel":
    case "cathedral":
      return 2;
    default: {
      const _exhaustive: never = tier;
      return _exhaustive;
    }
  }
}

export type FadeSlotResult = "started" | "queued";

interface QueuedFade {
  opId: string;
  /** Opaque generation / token so newer replaces older for same op. */
  token: string;
}

/**
 * Global FIFO queue of field/geometry fades with a concurrency cap.
 * Does not snap-clear the queue under any API.
 */
export class GpuFadeQueue {
  private readonly cap: number;
  private readonly active = new Map<string, string>(); // opId → token
  private readonly queue: QueuedFade[] = [];

  constructor(cap: number) {
    if (!Number.isFinite(cap) || cap < 1) {
      throw new Error(`GpuFadeQueue: cap must be >= 1, got ${cap}`);
    }
    this.cap = Math.floor(cap);
  }

  get activeCount(): number {
    return this.active.size;
  }

  get queuedCount(): number {
    return this.queue.length;
  }

  getActiveToken(opId: string): string | undefined {
    return this.active.get(opId);
  }

  /**
   * Request a fade slot. If under cap, starts immediately.
   * If at cap, enqueues (replacing any prior queued entry for the same op).
   */
  requestFade(opId: string, token: string): FadeSlotResult {
    // Already active for this op: treat as restart of same slot (same op).
    if (this.active.has(opId)) {
      this.active.set(opId, token);
      return "started";
    }

    if (this.active.size < this.cap) {
      this.active.set(opId, token);
      return "started";
    }

    // At capacity: FIFO queue; newer token replaces older for same op.
    const existingIdx = this.queue.findIndex((q) => q.opId === opId);
    if (existingIdx >= 0) {
      this.queue[existingIdx] = { opId, token };
    } else {
      this.queue.push({ opId, token });
    }
    return "queued";
  }

  /**
   * Complete an active fade. Promotes the next FIFO queued fade if any.
   * Returns the promoted entry, if one started.
   */
  completeFade(opId: string): QueuedFade | undefined {
    this.active.delete(opId);
    return this.promoteNext();
  }

  /** Promote head of queue into active if capacity allows. */
  private promoteNext(): QueuedFade | undefined {
    if (this.active.size >= this.cap) return undefined;
    const next = this.queue.shift();
    if (!next) return undefined;
    this.active.set(next.opId, next.token);
    return next;
  }

  /**
   * Explicitly forbidden: clearing the queue without running fades.
   * Exposed only so tests document the invariant — always throws.
   */
  snapClearQueueForbidden(): never {
    throw new Error(
      "GpuFadeQueue: snap-to-clear-queue is forbidden (§7.1)",
    );
  }
}
