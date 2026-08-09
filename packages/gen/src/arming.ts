/**
 * GEN arming state (§9.4).
 * Perform Mode: disarmed by default. Graph/edit may default armed.
 * Invokes require armed global and/or per-op.
 */

export type EditorMode = "edit" | "perform";

export interface ArmingSnapshot {
  mode: EditorMode;
  globalEdit: boolean;
  globalPerform: boolean;
  /** Effective global for current mode. */
  globalArmed: boolean;
  perOp: Record<string, boolean | null>;
}

export class ArmingController {
  /** Graph / Template Mode default armed for authoring (§9.4). */
  private globalEdit = true;
  /** Perform Mode default disarmed (§9.4). */
  private globalPerform = false;
  /** null = inherit global; true/false = override. */
  private readonly perOp = new Map<string, boolean | null>();
  private mode: EditorMode = "edit";

  setMode(mode: EditorMode): void {
    this.mode = mode;
  }

  getMode(): EditorMode {
    return this.mode;
  }

  setGlobalArmed(mode: EditorMode, armed: boolean): void {
    if (mode === "edit") this.globalEdit = armed;
    else this.globalPerform = armed;
  }

  /**
   * Per-op override. Pass null to clear override (inherit global).
   */
  setOpArmed(opId: string, armed: boolean | null): void {
    if (armed === null) this.perOp.delete(opId);
    else this.perOp.set(opId, armed);
  }

  globalArmedFor(mode: EditorMode = this.mode): boolean {
    return mode === "edit" ? this.globalEdit : this.globalPerform;
  }

  /**
   * Effective arming for an optional op id in the given mode.
   * Per-op override wins; otherwise global for mode.
   */
  isArmed(opId?: string, mode: EditorMode = this.mode): boolean {
    if (opId !== undefined && this.perOp.has(opId)) {
      return this.perOp.get(opId) === true;
    }
    return this.globalArmedFor(mode);
  }

  disarmedResult(providerId?: string): {
    status: "error";
    errorMessage: string;
    controlBlocked: true;
    providerId?: string;
  } {
    return {
      status: "error",
      errorMessage:
        "GEN disarmed. Arm globally or per-op to allow provider invokes.",
      controlBlocked: true,
      providerId,
    };
  }

  snapshot(): ArmingSnapshot {
    const per: Record<string, boolean | null> = {};
    for (const [k, v] of this.perOp) per[k] = v;
    return {
      mode: this.mode,
      globalEdit: this.globalEdit,
      globalPerform: this.globalPerform,
      globalArmed: this.globalArmedFor(),
      perOp: per,
    };
  }
}
