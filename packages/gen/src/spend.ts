/**
 * Per-session spend ceiling plumbing (§9.4 arming & cost control).
 * Hard-stops further invokes when reached (status=error, non-blocking).
 * Raising the ceiling is an explicit user action.
 */

import type { CapResult, CapUsage, CostEstimate } from "./types.js";

export type SpendUnit = "tokens" | "requests";

export interface SpendSnapshot {
  unit: SpendUnit;
  ceiling: number;
  used: number;
  remaining: number;
  hardStopped: boolean;
}

/** Conservative default: 50k tokens per session (§9.4). */
export const DEFAULT_TOKEN_CEILING = 50_000;
/** Alternative default when metering by request count. */
export const DEFAULT_REQUEST_CEILING = 100;

export class SpendCeiling {
  private unit: SpendUnit;
  private ceiling: number;
  private used = 0;

  constructor(
    unit: SpendUnit = "tokens",
    ceiling: number = unit === "tokens"
      ? DEFAULT_TOKEN_CEILING
      : DEFAULT_REQUEST_CEILING,
  ) {
    this.unit = unit;
    this.ceiling = Math.max(0, ceiling);
  }

  snapshot(): SpendSnapshot {
    const remaining = Math.max(0, this.ceiling - this.used);
    return {
      unit: this.unit,
      ceiling: this.ceiling,
      used: this.used,
      remaining,
      hardStopped: this.used >= this.ceiling,
    };
  }

  /**
   * Whether an invoke may start.
   * Optional estimate reserves capacity for token unit; requests use 1.
   */
  canInvoke(estimate?: CostEstimate | number): boolean {
    if (this.used >= this.ceiling) return false;
    const need =
      typeof estimate === "number"
        ? estimate
        : estimate
          ? estimate.amount
          : this.unit === "requests"
            ? 1
            : 0;
    if (this.unit === "requests") {
      return this.used + Math.max(1, need) <= this.ceiling;
    }
    // tokens: allow start if any remaining; estimate is advisory
    return this.used < this.ceiling;
  }

  /** Hard-stop CapResult when ceiling reached (§9.4). */
  hardStopResult(providerId?: string): CapResult {
    return {
      status: "error",
      errorMessage: `Spend ceiling reached (${this.used}/${this.ceiling} ${this.unit}). Raise the ceiling to continue.`,
      controlBlocked: true,
      providerId,
      usage: { requests: 0 },
    };
  }

  /**
   * Record usage after a successful or partial invoke.
   * Always counts at least 1 request when unit is requests.
   */
  record(usage?: CapUsage): void {
    if (this.unit === "requests") {
      this.used += Math.max(1, usage?.requests ?? 1);
      return;
    }
    const tokens =
      usage?.totalTokens ??
      (usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0);
    // If provider omitted usage, count a minimal unit so meter moves
    this.used += tokens > 0 ? tokens : 1;
  }

  /** Explicit user action to raise ceiling (§9.4). */
  raiseCeiling(newCeiling: number): void {
    if (!Number.isFinite(newCeiling) || newCeiling < this.ceiling) {
      throw new Error(
        "SpendCeiling.raiseCeiling: must be finite and ≥ current ceiling",
      );
    }
    this.ceiling = newCeiling;
  }

  setUnit(unit: SpendUnit, resetUsed = false): void {
    this.unit = unit;
    if (resetUsed) this.used = 0;
  }

  /** Test / session reset. */
  resetUsed(): void {
    this.used = 0;
  }
}
