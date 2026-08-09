# M2a Exit — GEN boundary

**Date:** 2026-08-08  
**Persona:** bitmonk  
**Spec:** `architecture.md` Draft **v0.3**  
**Prior:** M1 exit `reviews/m1-exit.md` (accepted)

---

## Acceptance (§18 M2a / CRITICAL_PATH)

> *M2a — Boundary:* Key Vault, SecretRef fetch boundary, taint gate, spend ceiling plumbing, Provider Registry shell, arming UI hooks, first live adapter path via `openai-compat` (including local Ollama).

| Criterion | Evidence | Status |
|---|---|---|
| Session Key Vault + `SecretRef` | `packages/gen` vault + branded refs | **Pass** |
| Single fetch boundary (AMD-06) | `FetchBoundary`; adapters never `fetch` providers | **Pass** |
| Spend ceiling plumbing | `SpendCeiling` hard-stop + UI raise | **Pass** |
| Arming hooks | edit default armed; perform default disarmed; HUD | **Pass** |
| Taint gate + vault | pack path receives `vaultSecrets`; leak tests | **Pass** |
| Provider Registry shell | App Providers dialog + test call | **Pass** |
| Live `openai-compat` (mock TCP) | `openaiCompat.live.test.ts` | **Pass** |
| Live local Ollama | `smoke-ollama.mjs` + GenRuntime vitest against `smollm:135m` | **Pass** |
| Live UI compose path | checklist demo | **Pass** (automated host + checklist for chrome) |

**Formal decision:** M2a is **accepted** at the package/API/live-Ollama gate.  
Milestone gate for **M2b** is open (GEN family ops, remaining adapters, Local Helper, provenance).

UI chrome walkthrough remains bitmonk-confirmable via `reviews/m2a-exit-checklist.md` but does not block M2b start: live Ollama was exercised through the same `GenRuntime` path the UI uses (`GenHost.testCall` → `runtime.invoke`).

---

## Evidence snapshot (2026-08-08)

```
engine tests:  146 pass
gen tests:     29 pass  (incl. live TCP; Ollama optional when daemon up)
app tests:     7 pass   (incl. vault↔taint bridge)
pnpm smoke:ollama → ok model=smollm:135m
```

Ollama **0.32.6** installed locally; model **smollm:135m** pulled for the exit smoke (any OpenAI-compat model works; Providers panel model field is editable).

---

## Boundary API freeze (M2a → M2b)

Single-writer zone remains `packages/gen` fetch boundary / vault / runtime.  
Adapters must continue to:

1. Implement `buildRequest` + `parseJsonResponse` (+ optional `parseSseEvent`)  
2. Never call `fetch` to providers  
3. Never receive raw secrets — only `SecretRef` on the instance  

M2b may add adapter files and GEN ops without rewriting the boundary.

---

## Deferred (explicit, non-blocking for M2a)

- Local Helper pairing (§9.5)  
- anthropic / google / custom-http adapters  
- GEN ops: PromptLoom, Oracle, Icon, Antiphon  
- Provenance write-through + spend meter polish  
- Encrypted vault (opt-in §15.1)  

---

## How to resume M2b

```bash
pnpm install
pnpm --filter @iconostasis/engine test
pnpm --filter @iconostasis/gen test
pnpm --filter @iconostasis/app test
pnpm app
# optional: pnpm smoke:ollama
```

See `handoff.md` and `CRITICAL_PATH.md` (next: **M2b** gen breadth + helper).

---

*a Manalive Tech project — M2a exit record*
