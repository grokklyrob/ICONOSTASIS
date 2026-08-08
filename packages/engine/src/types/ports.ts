/**
 * Port types and async presentation state (architecture.md §7.1).
 */

export type PortType =
  | "signal"
  | "field"
  | "geometry"
  | "material"
  | "text"
  | "media"
  | "event"
  | "story";

export type AsyncStatus = "idle" | "pending" | "fresh" | "error";

/** Presentation state for async outputs (Async Arrival Law §7.1). */
export type Presentation = "current" | "fading" | "queued";

export type SignalValue = number | [number, number] | [number, number, number];

export interface PortSpec {
  id: string;
  type: PortType;
  /** Optional human label for editor (M1). */
  label?: string;
}

export interface AsyncPortState<T = unknown> {
  status: AsyncStatus;
  presentation: Presentation;
  lastGoodValue: T | undefined;
  errorMessage?: string;
}
