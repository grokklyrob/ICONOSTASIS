# M1 Exit — Instrument

**Date:** 2026-08-08  
**Persona:** bitmonk  
**Spec:** `architecture.md` Draft **v0.3**  
**Prior:** M0 exit `reviews/m0-exit.md` (accepted)

---

## Acceptance (§18)

> *Demo: compose and perform a one-station piece live; show synthetic async policies under probe.*

| Criterion | Evidence | Status |
|---|---|---|
| All **31 non-GEN** catalog ops (type/ports/params/serialize/cook) | `registerM1Operators`, `catalog.m1.test.ts` | **Pass** |
| Radiance Stack + tier auto-bypass | FX ops + `resolveRadianceStack` + ToneMap on `OUT/Render` | **Pass** |
| Measured tier + point governor | `tier/*`; PointCloud / Particles honor leases | **Pass** |
| OPFS autosave + `.icx` pack/unpack + taint gate | `packages/engine/src/persist/*` | **Pass** |
| Graph editor shell + Perform Mode v0 | `packages/app` (SVG graph, split viewport, exposable sliders) | **Pass** |
| Synthetic async under probe | Engine tests + in-app **Arrival probe** panel | **Pass** |
| Live compose/perform seraph + probe | Bitmonk session 2026-08-08 (“things seem to be working”) | **Pass** |

**Formal decision:** M1 is **accepted**. Milestone gate for **M2a** is open.  
**Development pause** requested after this exit — do not start M2a until bitmonk resumes.

---

## Deferred (explicit, non-blocking for M1 exit)

- Shrine nested-graph collapse (§7.3 full)
- Live field thumbnails ≤5 Hz
- Full §16.4 flash-count over 1s (rise-rate clamp already real)
- Music transport (pause/stop) in app chrome
- GPU depth for SDF / particles / glyph / instancer beyond cook-time handles
- Playwright / golden frames

---

## How to resume later

```bash
pnpm install
pnpm --filter @iconostasis/engine test   # expect 146+
pnpm app                                 # editor + Arrival probe
```

See `handoff.md` and `CRITICAL_PATH.md` (next: **M2a** packages/gen boundary).

---

*a Manalive Tech project — M1 exit record*
