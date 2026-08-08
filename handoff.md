# Handoff — ICONOSTASIS M0 Seed

**Date:** 2026-08-08  
**Persona:** bitmonk  
**Spec:** `architecture.md` Draft **v0.3** (frozen for M0; no silent amendments)  
**Sequencing:** `CRITICAL_PATH.md` · single agent · no subagents · no worktrees  
**Process:** `AGENTS.md` invariants bind every change  

This document is enough to resume **exactly** where the last session stopped.

---

## 1. Where we left off

### Milestone: **M0 — Seed** (§18)

| Deliverable | Status |
|---|---|
| Monorepo scaffold (§17) | **Done** |
| Engine core: ports, graph, dirty pull-cook, modulation edges | **Done** |
| Six operators | **Done** |
| `seraph.bin` loader + decimation hook + async PointCloud | **Done** |
| `graph.json` round-trip + unknown fields | **Done** |
| Demo shell: canvas + audio + patched seraph | **Done** (visually usable after bloom/point-size fix) |
| Live acceptance review by bitmonk | **Partial** — “looks good for now”; night pause |

### What bitmonk last saw

- `pnpm demo` runs; Enter starts audio + rAF.
- Seraph point cloud is **visible** (gold additive points + bloom), not a whiteout blob (that was fixed).
- Audio file plays (`assets/test-drone.ogg`).
- Status line: `patched seraph running (graph wires + modulations)`.
- Session paused for the night **after** visual fix; no Step beyond M0 demo polish started.

### Explicit non-started work

- **M1+** (full catalog, graph editor, OPFS, `.icx`, Radiance Stack beyond Bloom, measured tier, point governor, GEN, story, player, publish).
- Playwright / golden frames.
- Spec amendments (none required yet).
- CI workflows for the monorepo.

---

## 2. How to resume (first 5 minutes)

```bash
cd C:\Users\color\projects\iconostasis   # or your clone path
pnpm install
pnpm --filter @iconostasis/engine test   # expect 65 passed
pnpm --filter @iconostasis/engine typecheck
pnpm demo                                # Vite → Enter → seraph + drone
```

**Asset paths (canonical):**

- `assets/seraph.bin` — 288k points (`uint32` count + `f32` xyz + `u8` rgb)
- `assets/test-drone.ogg` — **single** `.ogg` extension (root duplicates removed)

**Demo serves** publicDir = repo `assets/`, so:

- graph `assetPath: "assets/seraph.bin"` → fetch `/seraph.bin`
- audio `/test-drone.ogg`

---

## 3. Binding rules (do not re-litigate)

1. `architecture.md` v0.3 is sole product truth; cite § numbers.
2. **No SPEC AMENDMENT** unless a v0.3 requirement is proven impossible — then stop and emit `SPEC AMENDMENT PROPOSAL` per `AGENTS.md`.
3. Hard invariants (review fails regardless of tests):
   - No secrets on serialize/export/publish paths  
   - GEN never blocks a frame (N/A until M2, but cook is already `void`)  
   - Exported player never calls AI (N/A until M3)  
   - WebGL2 first-class; WebGPU never required  
   - `packages/engine` UI-free, headless-testable  
   - Flash limiter always on in player path (**M0: real rise-rate clamp**, not a stub)
4. Single agent on engine spine; **no subagents / worktrees** for remaining M0 polish.
5. Ask before any dependency **not** listed in §17.
6. Step-by-step stops for review were the process this session; continue that habit unless bitmonk says otherwise.

### Approved plan flags (already decided)

| Flag | Disposition |
|---|---|
| pnpm | approved |
| `apps/m0-demo` | approved |
| `three` in engine; no Playwright in M0; no state lib; hand-rolled / three-addons bloom (no `postprocessing` npm) | approved |
| Built-in points draw on `OUT/Render` | approved M0 bridge |
| **Port freeze:** `GEO/PointCloud.geometry` → `OUT/Render.geometry`; `FX/Bloom.field` → `OUT/Render.bloom` — M1 must consume same graph JSON without migration | **binding** |
| Flash limiter | **real** rise-rate clamp; TODO §16.4 for full WCAG flash-count in M1 |
| Modulation JSON | top-level `wires[]` + `modulations[]`; Appendix B per-node sugar on read only |
| Audio filename | `assets/test-drone.ogg` |

Plan file (session): may live under `~/.grok/sessions/.../plan.md` — repo source of truth for process is this handoff + `AGENTS.md` + `CRITICAL_PATH.md`.

---

## 4. Repo layout (what exists now)

```
iconostasis/
  architecture.md          # v0.3
  CRITICAL_PATH.md
  AGENTS.md / agents.md
  handoff.md               # this file
  package.json             # pnpm workspace root
  pnpm-workspace.yaml
  tsconfig.base.json
  assets/
    seraph.bin
    test-drone.ogg
  packages/engine/         # @iconostasis/engine — UI-free
    src/
      types/               # OperatorDef, ports, params, CookContext
      graph/               # document, topology, serialize, fixtures/
      cook/                # evaluator, dirty, modulation
      registry/
      operators/           # Time, AudioIn, LFO, PointCloud, Bloom, Render
      audio/               # pure band analyser
      assets/              # seraphBin parse, decimate, geometry handles
      render/              # backend iface, mock, flashLimiter, threeWebGLBackend
  apps/m0-demo/            # thin shell — NOT part of engine package
    src/main.ts            # no hardcoded audio→bloom; graph only
    src/audioHost.ts
    src/frameLoop.ts
    src/loadAsset.ts
```

---

## 5. Engine architecture (resume map)

### Cook model (§7.1, AMD-01)

- `cook(ctx): void` — never a Promise; evaluator never awaits.
- Pull-eval from `OUT/*` sinks; dirty flags; `alwaysDirty` for live sources/sinks.
- Modulation edges resolve to **effective** params before cook; **base** `instance.params` never mutated (AMD-14).
- Host injects via `EvaluatorHost`: `loadAsset`, `renderBackend`; frame injects `audio?: AudioFrameSnapshot`.

### Six operators (all registered in `registerM0Operators`)

| Type | Role |
|---|---|
| `SRC/Time` | `time`, `delta`, `frame`; modulatable `speed` |
| `SRC/AudioIn` | `rms`, `peak`, `bandLow`…`bandHigh`; pure spectrum → bands |
| `SIG/LFO` | free-run or phase input; waveforms sine/tri/saw/square |
| `GEO/PointCloud` | async `.bin` load; `lastGoodValue` / status; `maxPoints` decimate; modulatable `displacement`, `pointSize` |
| `FX/Bloom` | publishes `BloomPassState` on `field` |
| `OUT/Render` | draws geometry via backend; applies bloom; **always-on** rise-rate flash clamp |

### Fixture graph (acceptance patch)

`packages/engine/src/graph/fixtures/m0-seraph.graph.json`

| Edge | Meaning |
|---|---|
| mod `audio1.bandLow` → `pc1.displacement` | `[0,1]→[0,0.15]` |
| mod `audio1.bandHigh` → `bloom1.strength` | `[0,1]→[1.0,2.2]` |
| mod `lfo1.out` → `pc1.pointSize` | slow breath |
| wire `pc1.geometry` → `out1.geometry` | frozen port |
| wire `bloom1.field` → `out1.bloom` | frozen port |

**Critical:** `apps/m0-demo/src/main.ts` must not assign displacement/bloom from audio. Review by opening fixture + `main.ts`.

### `seraph.bin` format

```
uint32 LE pointCount
float32[count * 3] positions xyz
uint8[count * 3]   colors rgb   (optional; present on shipped asset)
```

Shipped: **288_000** points.

### Flash limiter (M0)

- `packages/engine/src/render/flashLimiter.ts` — **rise-rate clamp is real**.
- TODO in file cites §16.4 / AMD-10 / AMD-24 for M1 flash-count over 1s window.
- Do **not** replace with pass-through.

### Visual tuning (last fix)

If whiteout returns, check `threeWebGLBackend.ts`:

- Point size clamp + dim additive colors  
- `mapBloomStrength(graphStrength)` ≈ `× 0.22` into UnrealBloomPass  
- ACES tonemap on renderer  

---

## 6. Commands cheat sheet

```bash
pnpm install
pnpm test                          # engine vitest
pnpm typecheck                     # engine tsc
pnpm demo                          # apps/m0-demo Vite dev

pnpm --filter @iconostasis/engine test
pnpm --filter @iconostasis/engine typecheck
pnpm --filter @iconostasis/m0-demo typecheck
pnpm --filter @iconostasis/m0-demo build
```

Expect **65** engine tests green (as of this handoff).

---

## 7. Suggested next work (when resuming)

Ordered options for bitmonk; do not invent M1 scope without go-ahead.

### A. Close M0 formally (recommended first)

1. Re-run `pnpm demo` on a cold machine; confirm seraph form + audio reactivity.
2. Optional polish only if bitmonk asks: camera orbit, HUD band meters, `maxPoints` wayside preset.
3. Mark M0 demo accepted; tag or release note.
4. **Do not start M1** until M0 demo line is explicitly signed off (§18 / CRITICAL_PATH gates).

### B. If M0 still needs polish

- Further bloom/point size dial from live feedback  
- Ensure canvas resize / DPR edge cases  
- Confirm flash limiter doesn’t keep scene too dim too long (maxRisePerSecond = 2)

### C. M1 (only after M0 exit)

Per `CRITICAL_PATH.md`: two worktrees max later — engine vs app. M1 engine: remaining non-GEN ops, Radiance Stack, measured tier + governor, OPFS + `.icx`, **synthetic async op** before any real adapter. App: graph editor shell.

**Port freeze still binds M1:** same `geometry` / `bloom` ports; Assemble/MAT replace built-in draw without graph migration.

---

## 8. Known pitfalls

1. **pnpm only** — workspace uses `pnpm-workspace.yaml`.
2. Importing `@iconostasis/engine` in demo aliases to `packages/engine/src/index.ts` (source, not dist).
3. Orphan ops (e.g. `SRC/Time` in fixture with no pull path) never cook — LFO uses `ctx.time` from the frame clock; fine for M0.
4. `ThreeWebGLBackend` exported from engine barrel — pulls `three` when index is imported; tests still pass in Node.
5. Production `vite build` copies `assets/` to demo `dist/`; dev uses publicDir. Large `seraph.bin` must not be JS-bundled.
6. Windows path case: some shells show `Projects\ICONOSTASIS` vs `projects\iconostasis` — same tree.

---

## 9. Session process that worked

1. Plan first (approved with flag dispositions).  
2. Execute **one step at a time**; stop for review after green tests.  
3. Test-first for cook-order; colocated tests per operator (AGENTS.md).  
4. No subagents, no worktrees, no M1 packages.

Resume with: **confirm M0 acceptance** or **small demo polish**, then only after sign-off open M1 planning against §18 + CRITICAL_PATH.

---

## 10. Commit context at handoff

This handoff is written to be committed with the full M0 scaffold + engine + demo.  
If `git status` shows uncommitted `packages/`, `apps/`, lockfile, etc., that **is** the M0 implementation — include it with this file.

---

*a Manalive Tech project — handoff for ICONOSTASIS M0*
