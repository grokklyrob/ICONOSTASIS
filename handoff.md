# Handoff — ICONOSTASIS M1 Instrument (post-M0)

**Date:** 2026-08-08  
**Persona:** bitmonk  
**Spec:** `architecture.md` Draft **v0.3** (frozen; no silent amendments)  
**Sequencing:** `CRITICAL_PATH.md`  
**Process:** `AGENTS.md` invariants bind every change  
**M0 exit:** `reviews/m0-exit.md` — **accepted**

This document is enough to resume **exactly** where the last session stopped.

---

## 1. Where we left off

### Milestone: **M0 — Seed** (§18) — **CLOSED**

| Deliverable | Status |
|---|---|
| Monorepo scaffold (§17) | **Done** |
| Engine core: ports, graph, dirty pull-cook, modulation edges | **Done** |
| Six operators | **Done** |
| `seraph.bin` loader + decimation + async PointCloud | **Done** |
| `graph.json` round-trip + unknown fields | **Done** |
| Demo shell: canvas + audio + patched seraph | **Done** |
| Formal exit | **`reviews/m0-exit.md`** |

### Milestone: **M1 — Instrument** (§18) — **IN PROGRESS**

*Demo: compose and perform a one-station piece live; show synthetic async policies under probe.*

Exit gate (CRITICAL_PATH): all **31 non-GEN** catalog ops; Radiance Stack; measured tier + point governor; OPFS + `.icx`; Perform v0; **synthetic async operator** proves Arrival Law **before any real adapter**.

| M1 step | Status |
|---|---|
| **M1.1** Async arrival + `TEST/SyntheticAsync` | **Landed** — pure helpers + probe op; not in net-31 |
| **M1.2** Measured tier + point governor | **Landed** — `tier/*`, PointCloud honors governor |
| **M1.3** Radiance Stack remainder | **Next** |
| M1.4–M1.6 | Pending |

### Explicit non-started (M1 remainder / later)

- M2+ (GEN boundary, story, player, publish)
- Playwright / golden frames
- Spec amendments (none required yet)

---

## 2. How to resume (first 5 minutes)

```bash
cd C:\Users\color\projects\iconostasis
pnpm install
pnpm --filter @iconostasis/engine test
pnpm --filter @iconostasis/engine typecheck
pnpm demo                                # M0 seraph still works
```

**Asset paths (canonical):**

- `assets/seraph.bin` — 288k points
- `assets/test-drone.ogg` — single `.ogg` extension

---

## 3. Binding rules (do not re-litigate)

1. `architecture.md` v0.3 is sole product truth; cite § numbers.
2. **No SPEC AMENDMENT** unless a v0.3 requirement is proven impossible — then stop and emit `SPEC AMENDMENT PROPOSAL` per `AGENTS.md`.
3. Hard invariants:
   - No secrets on serialize/export/publish paths  
   - GEN never blocks a frame (`cook` is `void`)  
   - Exported player never calls AI (N/A until M3)  
   - WebGL2 first-class; WebGPU never required  
   - `packages/engine` UI-free, headless-testable  
   - Flash limiter always on in player path (rise-rate clamp real; flash-count TODO §16.4)
4. **M1 worktrees (CRITICAL_PATH):** two max later — engine vs app against published engine API. Prefer single agent until app shell exists. No multi-writer inside engine.
5. Ask before any dependency **not** listed in §17.
6. Step-by-step: plan → implement one slice → green tests → stop for review unless bitmonk says otherwise.

### Approved plan flags (M0, still binding)

| Flag | Disposition |
|---|---|
| pnpm | approved |
| `apps/m0-demo` | approved (smoke shell; not the M1 editor) |
| `three` in engine; no Playwright in M0; hand-rolled / three-addons bloom | approved |
| Built-in points draw on `OUT/Render` | M0 bridge; M1 Assemble/MAT must not break frozen ports |
| **Port freeze:** `geometry` / `bloom` ports | **binding** |
| Flash limiter | real rise-rate clamp |
| Modulation JSON | top-level `wires[]` + `modulations[]`; Appendix B sugar on read only |
| Audio filename | `assets/test-drone.ogg` |

---

## 4. M1 ordered plan (engine-first spine)

Do not reorder past a gate without bitmonk go-ahead.

| Step | Focus | Gate / note |
|---|---|---|
| **M1.1** | Async arrival runtime + **`TEST/SyntheticAsync`** probe | CRITICAL_PATH: Arrival Law (status, lastGoodValue, stream vs replace text, audio queue-to-cue, GPU fade cap/queue, `cacheScope`, failure + fake latency) **before any real adapter** |
| **M1.2** | Measured tier probe + **point governor** | §8.4 scene-total budgets; PointCloud / future emitters honor remaining |
| **M1.3** | Radiance Stack remainder | Godrays, ChromaticAberration, Grain, Vignette; ToneMap on `OUT/Render`; tier auto-bypass |
| **M1.4** | Non-GEN catalog batches | SIG → SRC remainder → MAT → GEO → FX remainder → LIT → `OUT/AudioOut` (31 total incl. M0 six) |
| **M1.5** | Taint gate + `.icx` pack/unpack + OPFS autosave | §12; secrets never serialize |
| **M1.6** | `packages/app` graph editor shell + Perform v0 | Against engine API; §7.3 |
| **M1 exit** | One-station compose + perform + synthetic async under probe | §18 italic demo |

**M0 six already count:** Time, AudioIn, LFO, PointCloud, Bloom, Render → **25 operators still to land** for the 31 non-GEN total (plus TEST synthetic, which is **not** in the 31).

---

## 5. Repo layout (current)

```
iconostasis/
  architecture.md
  CRITICAL_PATH.md
  AGENTS.md / agents.md
  handoff.md
  reviews/m0-exit.md
  package.json / pnpm-workspace.yaml / tsconfig.base.json
  assets/seraph.bin , test-drone.ogg
  packages/engine/          # @iconostasis/engine
  apps/m0-demo/             # thin seraph shell
```

M1 will add: `packages/engine/src/async/*`, more operators, tier/governor, persist/icx, later `packages/app`.

---

## 6. Commands cheat sheet

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm demo

pnpm --filter @iconostasis/engine test
pnpm --filter @iconostasis/engine typecheck
pnpm --filter @iconostasis/m0-demo typecheck
pnpm --filter @iconostasis/m0-demo build
```

---

## 7. Known pitfalls

1. **pnpm only.**
2. Demo aliases `@iconostasis/engine` → `packages/engine/src/index.ts`.
3. Orphan ops never cook if not on a pull path from `OUT/*`.
4. `ThreeWebGLBackend` on the barrel pulls `three` when index is imported.
5. Do not JS-bundle `seraph.bin`.
6. Port freeze still binds M1 graph fixtures.

---

## 8. Session process

1. Plan the slice (flags if any).  
2. Test-first; colocated cook-order tests per operator.  
3. Green suite → stop for review.  
4. No real AI adapters until M1.1 synthetic async is proven and M2a boundary exists.

**Resume at:** **M1.3** — Radiance Stack remainder (Godrays, CA, Grain, Vignette; ToneMap on Render; tier auto-bypass).

---

*a Manalive Tech project — handoff for ICONOSTASIS M1*
