/**
 * Runtime scene-total point governor (architecture.md §8.4).
 *
 * Emitters receive min(requested, remaining). Loaders decimate assets to the
 * granted count. Budgets are scene-total across all point and particle emitters.
 */

export class PointGovernor {
  private _budget: number;
  /** Per-emitter current lease (points). */
  private readonly leases = new Map<string, number>();

  constructor(budget: number) {
    if (!Number.isFinite(budget) || budget < 0) {
      throw new Error(`PointGovernor: budget must be >= 0, got ${budget}`);
    }
    this._budget = Math.floor(budget);
  }

  get budget(): number {
    return this._budget;
  }

  get used(): number {
    let sum = 0;
    for (const n of this.leases.values()) sum += n;
    return sum;
  }

  get remaining(): number {
    return Math.max(0, this._budget - this.used);
  }

  getEmitterLease(emitterId: string): number {
    return this.leases.get(emitterId) ?? 0;
  }

  /**
   * Request an allocation for an emitter.
   * Re-requests release the previous lease for that emitter first, then grant
   * min(requested, remaining) so an emitter can grow/shrink without double-count.
   * Returns granted count (0 if none available and requested > 0).
   */
  request(emitterId: string, requested: number): number {
    if (!Number.isFinite(requested) || requested <= 0) {
      this.release(emitterId);
      return 0;
    }
    const want = Math.floor(requested);
    const previous = this.leases.get(emitterId) ?? 0;
    // Free previous lease so remaining includes what this emitter already holds.
    if (previous > 0) this.leases.delete(emitterId);
    const granted = Math.min(want, this.remaining);
    if (granted > 0) {
      this.leases.set(emitterId, granted);
    }
    return granted;
  }

  /** Drop an emitter's lease (dispose / unload). */
  release(emitterId: string): void {
    this.leases.delete(emitterId);
  }

  /**
   * Reset all leases; optionally change the scene-total budget (tier change).
   */
  reset(budget?: number): void {
    this.leases.clear();
    if (budget !== undefined) {
      if (!Number.isFinite(budget) || budget < 0) {
        throw new Error(`PointGovernor.reset: budget must be >= 0, got ${budget}`);
      }
      this._budget = Math.floor(budget);
    }
  }

  /** Snapshot for tests / HUD. */
  snapshot(): {
    budget: number;
    used: number;
    remaining: number;
    leases: Record<string, number>;
  } {
    const leases: Record<string, number> = {};
    for (const [k, v] of this.leases) leases[k] = v;
    return {
      budget: this._budget,
      used: this.used,
      remaining: this.remaining,
      leases,
    };
  }
}
