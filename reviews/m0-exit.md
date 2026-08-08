# M0 Exit — Seed

**Date:** 2026-08-08  
**Persona:** bitmonk  
**Spec:** `architecture.md` Draft **v0.3**  
**Commit at exit:** `059c87d` (`M0 seed: engine cook spine, six operators, patched seraph demo.`)

---

## Acceptance (§18)

> *Demo: the audio-reactive seraph, patched not coded.*

| Criterion | Evidence | Status |
|---|---|---|
| Render loop + 6 operators (`SRC/Time`, `SRC/AudioIn`, `SIG/LFO`, `GEO/PointCloud`, `FX/Bloom`, `OUT/Render`) | `registerM0Operators`, colocated cook tests | **Pass** |
| `seraph.bin` loads and breathes with music | `apps/m0-demo` + fixture modulations; live review | **Pass** |
| Graph JSON round-trips (unknown fields preserved) | `serialize.roundtrip.test.ts` | **Pass** |
| **Patched not coded** — audio→params only via graph modulations | `m0-seraph.graph.json` modulations; `main.ts` forbids host-side audio→param | **Pass** |
| Engine headless-testable, UI-free (§17 / AGENTS.md) | 65 vitest green; no editor imports | **Pass** |
| WebGL2 path first-class; flash rise-rate clamp real | `ThreeWebGLBackend`, `flashLimiter.ts` | **Pass** |

**Formal decision:** M0 is **accepted**. Milestone gate for M1 is open.

---

## Verification at exit

```text
pnpm --filter @iconostasis/engine test       # 65 passed
pnpm --filter @iconostasis/engine typecheck  # clean
pnpm --filter @iconostasis/m0-demo typecheck # clean
pnpm --filter @iconostasis/m0-demo build     # clean
pnpm demo                                    # Enter → seraph + drone (prior live review)
```

---

## Binding carries into M1

- **Port freeze:** `GEO/PointCloud.geometry` → `OUT/Render.geometry`; `FX/Bloom.field` → `OUT/Render.bloom` — no migration for M1 graph JSON.
- Flash limiter stays on; M1 may extend §16.4 flash-count (do not remove rise-rate clamp).
- `architecture.md` v0.3 frozen; no silent amendments to §4 / §5 / §15.
- M0 demo app (`apps/m0-demo`) remains the seraph smoke shell; editor work lands in `packages/app`.

---

## Out of M0 (intentional)

Full non-GEN catalog, Radiance Stack beyond Bloom, measured tier + point governor, OPFS / `.icx`, synthetic async probe, graph editor, Perform Mode, Playwright / golden frames, monorepo CI, GEN, story, player, publish.

---

*a Manalive Tech project — M0 exit record*
