# M1 Exit checklist — Instrument

**Spec:** `architecture.md` §18 M1 · CRITICAL_PATH M1 gate  
**Date:** 2026-08-08  

> *Demo: compose and perform a one-station piece live; show synthetic async policies under probe.*

| Criterion | Evidence | Status |
|---|---|---|
| All **31 non-GEN** catalog ops (type/ports/params/serialize/cook) | `registerM1Operators` + `catalog.m1.test.ts` | **Pass** |
| Radiance Stack + tier auto-bypass | `resolveRadianceStack`, FX ops, ToneMap on Render | **Pass** |
| Measured tier + point governor | `tier/*`, PointCloud/Particles honor leases | **Pass** |
| OPFS autosave + `.icx` pack/unpack + taint gate | `persist/*` | **Pass** |
| Perform Mode v0 | `packages/app` hide graph + exposable sliders | **Pass** |
| Graph editor shell §7.3 (pan/zoom/wire/palette/inspector/split) | `packages/app` | **Pass** (Shrine collapse deferred) |
| **Synthetic async under probe** | Engine tests + **in-app Arrival probe panel** | **Pass** (live panel) |
| Live bitmonk demo sign-off | Compose/perform seraph + fire probe modes | **Pending you** |

### How to run the demo

```bash
pnpm app
```

1. **Enter** — seraph + drone (patched graph).  
2. **Compose** — add ops from palette, wire ports, tweak inspector.  
3. **Perform** — graph hides; drive exposable params.  
4. **Arrival probe** (inspector bottom, always on in edit):  
   - Pick mode (`signal`, `text-stream`, `text-replace`, `audio`, `field`, `geometry`, `fail`)  
   - Set latency → **Fire generation** → watch `status` / `presentation` / `presented`  
   - `audio`: Fire twice with “audio playing”, then **Audio cue** to promote queue  
   - `fail`: retains lastGood, sets error  

### Deferred (not blocking engine gate; polish)

- Shrine nested-graph collapse (§7.3)  
- Live field thumbnails ≤5 Hz  
- Full §16.4 flash-count window (rise-rate already real)  
- Transport pause/stop music  

### Formal decision

When the live demo above is accepted by bitmonk, mark M1 **closed** and open **M2a** (GEN boundary / SecretRef).

---

*a Manalive Tech project — M1 exit checklist*
