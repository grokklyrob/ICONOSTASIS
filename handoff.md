# Handoff — ICONOSTASIS (paused after M1)

**Date:** 2026-08-08  
**Persona:** bitmonk  
**Spec:** `architecture.md` Draft **v0.3** (frozen; no silent amendments)  
**Sequencing:** `CRITICAL_PATH.md`  
**Process:** `AGENTS.md` invariants bind every change  

**Status: DEVELOPMENT PAUSED** after M1 acceptance. Do not open M2a until bitmonk resumes.

| Exit | Record |
|---|---|
| **M0** | `reviews/m0-exit.md` — accepted |
| **M1** | `reviews/m1-exit.md` — **accepted 2026-08-08** |

This document is enough to resume **exactly** where work stopped.

---

## 1. Where we left off

### Milestone: **M0 — Seed** — CLOSED  
### Milestone: **M1 — Instrument** — **CLOSED** (accepted)

*Demo (accepted): compose and perform a one-station piece live; synthetic async policies under probe.*

| M1 step | Status |
|---|---|
| M1.1 Async arrival + `TEST/SyntheticAsync` | Done |
| M1.2 Measured tier + point governor | Done |
| M1.3 Radiance Stack remainder | Done |
| M1.4 Non-GEN catalog (net-31) | Done |
| M1.5 Taint + `.icx` + OPFS | Done |
| M1.6 App editor + Perform v0 | Done |
| M1 exit live sign-off | **Accepted** (`reviews/m1-exit.md`) |

### Explicit next (when resuming)

**M2a — GEN boundary** (`CRITICAL_PATH.md`):

- `packages/gen`: SecretRef single fetch boundary, taint already in engine persist  
- Spend ceiling plumbing, arming hooks  
- First live `openai-compat` (incl. local Ollama)  
- App: Provider Registry + Vault UI hooks  

Do **not** start real adapters breadth (M2b) until M2a boundary API is frozen or owned by one agent.

### Deferred polish (optional, not M2)

- Shrine collapse, field thumbnails, flash-count limiter, music transport  
- Deeper GPU for SDF/particles/glyph/instancer  

---

## 2. How to resume (first 5 minutes)

```bash
cd C:\Users\color\projects\iconostasis
pnpm install
pnpm --filter @iconostasis/engine test
pnpm --filter @iconostasis/engine typecheck
pnpm --filter @iconostasis/app typecheck
pnpm app                                 # editor + Arrival probe
# optional smoke:
pnpm demo                                # M0 thin seraph shell
```

**Expect:** engine **146** tests green (as of M1 exit); app store tests green.

**Asset paths:**

- `assets/seraph.bin` — 288k points  
- `assets/test-drone.ogg`  

**App (`pnpm app`):** Enter → seraph + drone; Perform hides graph; Inspector bottom = Arrival probe.

---

## 3. Binding rules (do not re-litigate)

1. `architecture.md` v0.3 is sole product truth; cite § numbers.  
2. **No SPEC AMENDMENT** unless a v0.3 requirement is proven impossible — then `SPEC AMENDMENT PROPOSAL` per `AGENTS.md`.  
3. Hard invariants:
   - No secrets on serialize/export/publish paths  
   - GEN never blocks a frame (`cook` is `void`)  
   - Exported player never calls AI  
   - WebGL2 first-class; WebGPU never required  
   - `packages/engine` UI-free, headless-testable  
   - Flash limiter always on in player path (rise-rate real; flash-count TODO §16.4)  
4. **Port freeze** still binds: `geometry` / `bloom` ports on M0 graph JSON.  
5. Ask before any dependency **not** listed in §17.  
6. Prefer single agent on gen boundary files through M2a.

### Approved stack notes

| Item | Disposition |
|---|---|
| pnpm workspace | approved |
| `three` in engine; fflate for `.icx` | approved (§17) |
| Vanilla TS app (no React Flow) | approved for M1 shell |
| `apps/m0-demo` | kept as thin smoke shell |

---

## 4. Repo map (post-M1)

```
iconostasis/
  architecture.md · CRITICAL_PATH.md · AGENTS.md · handoff.md
  reviews/m0-exit.md · reviews/m1-exit.md · reviews/m1-exit-checklist.md
  assets/seraph.bin · test-drone.ogg
  packages/engine/     # cook, 31 ops + TEST probe, tier, persist, render
  packages/app/        # editor + Perform + Arrival probe
  apps/m0-demo/        # original seraph smoke
```

M2 will add `packages/gen` (and later helper, story, player, publish).

---

## 5. Commands

```bash
pnpm install
pnpm test                          # engine
pnpm --filter @iconostasis/app test
pnpm typecheck                     # engine
pnpm --filter @iconostasis/app typecheck
pnpm app
pnpm demo
```

---

## 6. Known pitfalls

1. **pnpm only** — not `npm app`.  
2. App aliases `@iconostasis/engine` → engine `src/index.ts`.  
3. Graph pan: **Alt+drag** or **MMB**; **F** = fit view.  
4. Large `seraph.bin` must not be JS-bundled (Vite `publicDir` = repo `assets/`).  
5. Arrival probe is edit-mode only (hidden in Perform).  

---

## 7. Session process that worked

1. Milestone steps with green tests before advancing.  
2. Live bitmonk demo for §18 italic acceptance lines.  
3. Handoff + exit records under `reviews/`.  

**On resume:** read this file + `reviews/m1-exit.md` + `CRITICAL_PATH.md` § M2a; plan M2a boundary before writing adapters.

---

*a Manalive Tech project — handoff (paused after M1)*
