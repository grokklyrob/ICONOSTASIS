/**
 * Provider Registry — configured adapter instances (§9.3).
 * Holds config + SecretRef; never raw secrets.
 */

import type {
  ProviderAdapter,
  ProviderInstance,
  ProviderRouting,
  SecretRef,
} from "./types.js";

export class ProviderRegistry {
  private readonly adapters = new Map<string, ProviderAdapter>();
  private readonly instances = new Map<string, ProviderInstance>();

  registerAdapter(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  getAdapter(id: string): ProviderAdapter | undefined {
    return this.adapters.get(id);
  }

  listAdapters(): ProviderAdapter[] {
    return [...this.adapters.values()];
  }

  /**
   * Add or replace a configured provider instance.
   * secretRef is opaque; raw key stays in SessionVault.
   */
  upsertInstance(instance: ProviderInstance): void {
    if (!this.adapters.has(instance.adapterId)) {
      throw new Error(
        `ProviderRegistry: unknown adapter "${instance.adapterId}"`,
      );
    }
    this.instances.set(instance.id, {
      ...instance,
      config: { ...instance.config },
    });
  }

  getInstance(id: string): ProviderInstance | undefined {
    const inst = this.instances.get(id);
    return inst
      ? { ...inst, config: { ...inst.config } }
      : undefined;
  }

  listInstances(): ProviderInstance[] {
    return [...this.instances.values()].map((i) => ({
      ...i,
      config: { ...i.config },
    }));
  }

  removeInstance(id: string): boolean {
    return this.instances.delete(id);
  }

  setInstanceSecret(id: string, secretRef: SecretRef | null): void {
    const inst = this.instances.get(id);
    if (!inst) throw new Error(`ProviderRegistry: no instance "${id}"`);
    inst.secretRef = secretRef;
  }

  setInstanceRouting(id: string, routing: ProviderRouting): void {
    const inst = this.instances.get(id);
    if (!inst) throw new Error(`ProviderRegistry: no instance "${id}"`);
    inst.routing = routing;
  }

  clearInstances(): void {
    this.instances.clear();
  }
}
