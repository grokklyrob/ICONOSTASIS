/**
 * Working autosave ring buffer (§12.1).
 * OPFS when available; in-memory fallback for Node/tests/unsupported hosts.
 * Debounce (≤15s) is host-owned — this module stores slots only.
 */

export const AUTOSAVE_RING_SIZE = 20;

export interface AutosaveMeta {
  slot: number;
  savedAt: string; // ISO
  bytes: number;
  label?: string;
}

export interface AutosaveStore {
  write(slot: number, bytes: Uint8Array, meta: AutosaveMeta): Promise<void>;
  read(slot: number): Promise<Uint8Array | null>;
  readMeta(): Promise<AutosaveMeta[]>;
  clear(): Promise<void>;
}

/** In-memory store — default for headless tests and OPFS-unavailable hosts. */
export class MemoryAutosaveStore implements AutosaveStore {
  private readonly slots = new Map<number, Uint8Array>();
  private meta: AutosaveMeta[] = [];

  async write(
    slot: number,
    bytes: Uint8Array,
    meta: AutosaveMeta,
  ): Promise<void> {
    this.slots.set(slot, bytes.slice());
    this.meta = [
      meta,
      ...this.meta.filter((m) => m.slot !== slot),
    ].slice(0, AUTOSAVE_RING_SIZE);
  }

  async read(slot: number): Promise<Uint8Array | null> {
    const b = this.slots.get(slot);
    return b ? b.slice() : null;
  }

  async readMeta(): Promise<AutosaveMeta[]> {
    return [...this.meta];
  }

  async clear(): Promise<void> {
    this.slots.clear();
    this.meta = [];
  }
}

/**
 * OPFS-backed store under `/iconostasis/autosave/`.
 * Falls back is the caller's job when getDirectory throws.
 */
export class OpfsAutosaveStore implements AutosaveStore {
  private root: FileSystemDirectoryHandle | null = null;

  private async ensureRoot(): Promise<FileSystemDirectoryHandle> {
    if (this.root) return this.root;
    const nav = globalThis.navigator as Navigator & {
      storage?: { getDirectory?: () => Promise<FileSystemDirectoryHandle> };
    };
    if (!nav.storage?.getDirectory) {
      throw new Error("OPFS unavailable: navigator.storage.getDirectory missing");
    }
    const opfs = await nav.storage.getDirectory();
    const app = await opfs.getDirectoryHandle("iconostasis", { create: true });
    this.root = await app.getDirectoryHandle("autosave", { create: true });
    return this.root;
  }

  async write(
    slot: number,
    bytes: Uint8Array,
    meta: AutosaveMeta,
  ): Promise<void> {
    const root = await this.ensureRoot();
    const file = await root.getFileHandle(`slot-${slot}.icx`, { create: true });
    const writable = await file.createWritable();
    // FileSystemWritableFileStream accepts BufferSource; copy for ArrayBuffer typing.
    await writable.write(bytes.slice());
    await writable.close();

    const metaFile = await root.getFileHandle("meta.json", { create: true });
    const prev = await this.readMeta();
    const next = [meta, ...prev.filter((m) => m.slot !== slot)].slice(
      0,
      AUTOSAVE_RING_SIZE,
    );
    const w = await metaFile.createWritable();
    await w.write(new TextEncoder().encode(JSON.stringify(next)));
    await w.close();
  }

  async read(slot: number): Promise<Uint8Array | null> {
    try {
      const root = await this.ensureRoot();
      const file = await root.getFileHandle(`slot-${slot}.icx`);
      const blob = await file.getFile();
      return new Uint8Array(await blob.arrayBuffer());
    } catch {
      return null;
    }
  }

  async readMeta(): Promise<AutosaveMeta[]> {
    try {
      const root = await this.ensureRoot();
      const file = await root.getFileHandle("meta.json");
      const text = await (await file.getFile()).text();
      const parsed = JSON.parse(text) as AutosaveMeta[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async clear(): Promise<void> {
    const root = await this.ensureRoot();
    // Remove known slots + meta (best-effort).
    for (let i = 0; i < AUTOSAVE_RING_SIZE; i++) {
      try {
        await root.removeEntry(`slot-${i}.icx`);
      } catch {
        /* missing */
      }
    }
    try {
      await root.removeEntry("meta.json");
    } catch {
      /* missing */
    }
  }
}

/**
 * Ring buffer of last N autosaves (default 20).
 * Host debounces (≤15s) then calls save().
 */
export class AutosaveRing {
  private nextSlot = 0;

  constructor(
    private readonly store: AutosaveStore,
    private readonly ringSize: number = AUTOSAVE_RING_SIZE,
  ) {}

  /** Persist bytes; returns the slot written. */
  async save(bytes: Uint8Array, label?: string): Promise<AutosaveMeta> {
    const slot = this.nextSlot % this.ringSize;
    this.nextSlot += 1;
    const meta: AutosaveMeta = {
      slot,
      savedAt: new Date().toISOString(),
      bytes: bytes.byteLength,
      label,
    };
    await this.store.write(slot, bytes, meta);
    return meta;
  }

  async latest(): Promise<{ meta: AutosaveMeta; bytes: Uint8Array } | null> {
    const meta = await this.store.readMeta();
    if (meta.length === 0) return null;
    // meta[0] is most recent write
    const m = meta[0]!;
    const bytes = await this.store.read(m.slot);
    if (!bytes) return null;
    return { meta: m, bytes };
  }

  async list(): Promise<AutosaveMeta[]> {
    return this.store.readMeta();
  }

  async load(slot: number): Promise<Uint8Array | null> {
    return this.store.read(slot);
  }

  async clear(): Promise<void> {
    this.nextSlot = 0;
    await this.store.clear();
  }
}

/** Prefer OPFS; fall back to memory when unavailable. */
export async function createAutosaveStore(): Promise<{
  store: AutosaveStore;
  backend: "opfs" | "memory";
}> {
  try {
    const opfs = new OpfsAutosaveStore();
    // Probe write
    await opfs.write(
      0,
      new Uint8Array([0]),
      {
        slot: 0,
        savedAt: new Date().toISOString(),
        bytes: 1,
        label: "probe",
      },
    );
    await opfs.clear();
    return { store: opfs, backend: "opfs" };
  } catch {
    return { store: new MemoryAutosaveStore(), backend: "memory" };
  }
}
