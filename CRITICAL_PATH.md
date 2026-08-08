# ICONOSTASIS — Critical Path

**Status:** Accepted (advisor review v0.2); **M0 exit accepted 2026-08-08** (`reviews/m0-exit.md`)  
**Spec:** `architecture.md` Draft v0.3  
**Source:** bitmonk advisor §3 + AMD-20 / AMD-01 / M2a-before-M2b flags; v0.3 load-path matrix (AMD-21/22)  
**Current milestone:** M1 — Instrument (engine-first; see `handoff.md` M1.1…)

This document is the dependency and parallelism contract for multi-agent implementation. It does not replace milestone demos in §18; it sequences packages so agents do not thrash the same files.

---

## 1. Serial spine (cannot skip)

```
[Contracts]  port types, OperatorDef, graph.json / story.json / manifest schemaVersion, SecretRef boundary
     │
     ▼
[M0] packages/engine: cook graph + render loop + 6 ops + seraph load + graph round-trip
     │
     ├──────────────────────────────────────────────┐
     ▼                                              ▼
[M1a] packages/engine: remaining non-GEN ops,     [M1b] packages/app: graph editor shell,
      Radiance Stack, measured tier + governor,        inspector, perform mode v0,
      OPFS autosave, .icx pack/unpack,                 wired to engine APIs
      **synthetic async op (gate)**
     │                                              │
     └──────────────────┬───────────────────────────┘
                        ▼
[M1 exit] one-station compose + perform + synthetic async policies proven
                        │
        ┌───────────────┼────────────────┬──────────────────┐
        ▼               ▼                ▼                  ▼
[M2a] packages/gen    [M2b] packages/  [M2c] app: Provider [types] packages/story
      **boundary first** helper         Registry + Vault UI  (types only until M3)
      SecretRef fetch   (independent)   (depends gen+app)
      + openai-compat
        │
        ▼  (M2a API frozen or same agent)
[M2b breadth] remaining adapters, paired Local Helper, full GEN family, provenance
        │
        ▼
[M2 exit] live GEN demo (armed/disarmed, spend hard-stop, Ollama path)
        │
        ├────────────────────────────┐
        ▼                            ▼
[M3a] packages/story +            [M3b] packages/player
      Procession/Template UI in app     (engine player subset + story;
      + four templates as fixtures       NO gen invoke, NO app editor)
        │                            │
        └────────────┬───────────────┘
                     ▼
[M3 exit] Via Lucis: (A) hosted-pair http(s) wayside phone; (B) offline-complete file:// desktop; (C) player + user-picked .icx phone
                     │
        ┌────────────┼──────────────┐
        ▼            ▼              ▼
[M4a] packages/   [M4b] apps/    [M4c] optional hosting path
      publish      gallery
                     │
                     ▼
[M4 exit] kind-1 in Buzz + 2 public clients; kind 31333 in Cloister
```

**Serial spine in one line:**  
schemas/contracts → engine cook+render (M0) → async runtime + full non-GEN catalog + icx (M1) → gen boundary (M2a) → gen breadth (M2b) → story binds to snapshots (M3) → player export (M3) → publish (M4).

M5 is stretch; out of critical path.

---

## 2. Milestone gates (contractual)

| Milestone | Package focus | Exit gate (must pass before next) |
|-----------|---------------|-----------------------------------|
| **M0** | `packages/engine` only | Audio-reactive seraph, patched not coded; graph JSON round-trip |
| **M1** | `engine` + `app` | All **31 non-GEN** net-catalog ops land (type/ports/params/serialize/cook); Radiance Stack; measured tier + point governor; OPFS + `.icx`; Perform v0; **synthetic async operator** proves Arrival Law (streaming text vs replacement, audio queue-to-cue, GPU fade cap/queue, `cacheScope`, failure) **before any real adapter** |
| **M2a** | `packages/gen` boundary + vault/registry hooks in `app` | SecretRef single fetch boundary; taint gate; spend ceiling plumbing; arming hooks; first live `openai-compat` (incl. local Ollama) |
| **M2b** | `packages/gen` adapters + `packages/helper` | Remaining adapters; Local Helper with pairing; GEN family complete; provenance; spend meter UX; M2 demo (live + armed/disarmed + hard stop) |
| **M3** | `packages/story` + `packages/player` + templates | `story.json` authority; four templates with pre-cached GEN artifacts; load paths per §13.1; Via Lucis demo matrix (A)(B)(C) |
| **M4** | `packages/publish` + `apps/gallery` | Publish once → kind-1 in Buzz + two public clients (working link); same experience via kind 31333 in Cloister |

---

## 3. Parallel worktrees (no shared file writers)

**Hard rule:** ≤1 writer agent per package at a time. If a task wants more than three agents writing the same package, restructure — do not fan out.

After **contracts are frozen** on main:

| Lane | Tree | Depends on (merged) | Safe parallel with |
|------|------|---------------------|--------------------|
| E | `packages/engine` | contracts | helper; publish (types only); gallery stubs |
| G | `packages/gen` | engine async port + SecretRef contracts | helper, story types, publish |
| H | `packages/helper` | nothing from app | everything |
| S | `packages/story` | engine param snapshot types | gen, helper, publish |
| A | `packages/app` | engine (+ later gen/story APIs) | helper; **not** multi-agents inside app |
| P | `packages/player` | engine player subset + story | gen, helper, publish, gallery |
| U | `packages/publish` | shared event types only | gen, story, helper, player |
| C | `apps/gallery` | publish event shape | almost everything |

### By milestone

- **M0:** *One* agent on `packages/engine` only.
- **M1:** Two worktrees max: (1) `packages/engine`, (2) `packages/app` against **published** engine API from main. Not two agents inside engine.
- **M2:** Up to three parallel after M2a boundary is mergeable: `packages/gen` (prefer single agent through M2a→M2b, or freeze boundary API then second agent only on adapter files), `packages/helper`, `packages/app` vault/registry UI only.
- **M3:** Two parallel: story+procession UI (one app agent), and `packages/player`. Templates: one agent sequential fixtures.
- **M4:** Two parallel: `packages/publish` and `apps/gallery`. App Publish button after publish package API lands.

---

## 4. One-writer collision surfaces

| Surface | Why single-owner |
|---------|------------------|
| `packages/engine/schemas/**` | Every package imports contracts |
| `packages/engine` graph cook / dirty / feedback / async arrival | M0–M1 spine; GEN and Story consume |
| Operator registry / catalog registration | Every op PR touches it |
| `FX/*`, `OUT/Render` (Radiance + flash limiter + tonemap) | Order and doctrinal limiter |
| `render/tier` + point governor | Budgets vs particles vs loaders |
| `packages/engine` persist (icx, OPFS, taint gate) | M1 + M2 taint + M3 export share packer |
| **`packages/gen` fetch boundary / vault invoke** | **M2a-before-M2b one-writer zone** — adapters must not invent fetch |
| `packages/gen` `openai-compat` adapter | Shared by local Ollama + cloud; high edit rate in M2 |
| `packages/app` project store | Editor, perform, vault UI project into one store |
| Graph editor canvas entry | §7.3 is one surface |
| Root `package.json`, workspace, base `tsconfig` | Dependency and path alias wars |
| CI / Agents.md perf budgets | Gates |
| Template fixtures / shared assets (`seraph.bin` refs) | M3 multi-agent thrash risk |
| `packages/publish` kind tags + gallery parsers | Tag shape must match exactly |
| `packages/player` embed/inliner | Export ownership |

---

## 5. Do not parallelize (even across packages)

- Taint gate vs any serializer (one design).
- Station snapshot schema vs graph param schema (AMD-02).
- Player GEN-stripping vs gen adapter work (player must not import gen invoke).
- Kind tag schema vs gallery parser (contract first, then both sides).
- **M2a fetch boundary vs M2b adapter bodies** until boundary API is merged or owned by one agent.

---

## 6. Package map (§17)

| Package | Owns |
|---------|------|
| `packages/engine` | Graph + render + audio; UI-free; headless-testable |
| `packages/gen` | Adapters + SecretRef fetch boundary |
| `packages/story` | Stations, cues, exits; `story.json` authority |
| `packages/app` | Editor UI |
| `packages/player` | Standalone player subset |
| `packages/publish` | Nostr / Blossom / kind 1 + 31333 |
| `packages/helper` | Local CORS/OSC helper (paired) |
| `apps/gallery` | Cloister front-end |

---

## 7. v0.2 flags folded into this path

| Flag | Effect |
|------|--------|
| M1 synthetic async | Engine exit criterion; blocks all real adapters |
| M1 = 31 non-GEN ops | Closed catalog; no “toward ~25” drift |
| M2a before M2b | One-writer on gen boundary files |
| Hybrid direct/helper (AMD-07) | Same package topology; higher helper quality bar |
| M4 kind-1 + 31333 demo | Test assertions only; publish → gallery order unchanged |
| Blossom-only media (AMD-28) | NIP-96 out of v1; publish package remains Blossom + kinds |
| Load paths (AMD-21/22) | M3 exit is (A)(B)(C) matrix, not bare file:// hosted-pair |

---

*a Manalive Tech project — critical path for ICONOSTASIS*
