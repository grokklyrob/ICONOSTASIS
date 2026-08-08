/**
 * Operator type → factory registry.
 */

import type {
  OperatorFactory,
  OperatorInstance,
} from "../types/operator.js";
import type { ParamValue } from "../types/params.js";

export class OperatorRegistry {
  private readonly factories = new Map<string, OperatorFactory>();

  register(factory: OperatorFactory): void {
    if (this.factories.has(factory.type)) {
      throw new Error(`Operator type already registered: ${factory.type}`);
    }
    this.factories.set(factory.type, factory);
  }

  get(type: string): OperatorFactory {
    const f = this.factories.get(type);
    if (!f) throw new Error(`Unknown operator type: ${type}`);
    return f;
  }

  has(type: string): boolean {
    return this.factories.has(type);
  }

  create(
    type: string,
    id: string,
    params: Record<string, ParamValue>,
  ): OperatorInstance {
    const factory = this.get(type);
    const merged: Record<string, ParamValue> = {};
    for (const spec of factory.params) {
      const provided = params[spec.id];
      merged[spec.id] = provided !== undefined ? provided : spec.default;
    }
    // Preserve unknown param keys for forward-compat (§12.2).
    for (const [k, v] of Object.entries(params)) {
      if (!(k in merged)) merged[k] = v;
    }
    return factory.create(id, merged);
  }

  listTypes(): string[] {
    return [...this.factories.keys()].sort();
  }
}
