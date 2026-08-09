# M2a Exit checklist — GEN boundary

**Spec:** `architecture.md` §18 M2a · CRITICAL_PATH M2a gate  
**Date:** 2026-08-08  

> *M2a — Boundary:* Key Vault, SecretRef fetch boundary, taint gate, spend ceiling plumbing, Provider Registry shell, arming UI hooks, first live adapter path via `openai-compat` (including local Ollama).

| Criterion | Evidence | Status |
|---|---|---|
| Session Key Vault + opaque `SecretRef` | `packages/gen` `SessionVault`, `secretRef.ts` + vault tests | **Pass** |
| Single fetch boundary (AMD-06) | `FetchBoundary`; adapters build descriptors only; live TCP + mock tests | **Pass** |
| Adapters never see raw secrets | `openai-compat` secretInjections; auth applied only at boundary | **Pass** |
| Spend ceiling plumbing | `SpendCeiling` + hard-stop in `GenRuntime` + UI raise | **Pass** |
| Arming hooks (edit armed / perform disarmed) | `ArmingController` + Perform HUD + Providers Arm control | **Pass** |
| Taint gate fed by vault on pack | `RuntimeHost.setVaultSecretsProvider` + `genHost.test.ts` leak/block | **Pass** |
| Provider Registry shell | App **Providers** dialog (registry, vault, test call, spend) | **Pass** |
| `openai-compat` adapter | JSON + SSE parse; Ollama defaults; no-auth local path | **Pass** |
| Live mock TCP path | `openaiCompat.live.test.ts` real `http` server | **Pass** |
| Live local Ollama | `pnpm smoke:ollama` + optional vitest (`ICONOSTASIS_OLLAMA_SMOKE=1`) | **Pass** (smollm:135m) |
| Live bitmonk UI sign-off | `pnpm app` → Providers → Test call; Perform arm/disarm | **Pending you** |

### How to run the demo

```bash
# Ollama (if not already up)
# ollama serve
# ollama pull smollm:135m   # or any model; set model field in UI

pnpm app
```

1. **Providers** — open dialog from chrome.  
2. Confirm **Local Ollama** (`http://127.0.0.1:11434/v1`), model matches a pulled tag.  
3. **Test call** (edit mode is armed by default) → expect `ok` + reply in status / panel.  
4. **Perform** → GEN shows **Disarmed**; Test call from Providers while perform-synced should block unless you **Arm**.  
5. Optional: Hold a cloud key in vault, add openai-compat provider, bind key, test.  
6. **Save .icx** with a key held — pack must not embed secrets (taint gate).  

**Browser CORS:** if the browser blocks Ollama, set  
`OLLAMA_ORIGINS=http://localhost:5173` (or `*`) and restart Ollama.  
Node smoke (`pnpm smoke:ollama`) does not need CORS.

### Automated

```bash
pnpm test:gen          # includes live TCP mock; Ollama skipped if down
pnpm smoke:ollama      # exit 2 if daemon down
# force Ollama in vitest:
#   $env:ICONOSTASIS_OLLAMA_SMOKE=1; $env:OLLAMA_MODEL="smollm:135m"; pnpm test:gen
pnpm --filter @iconostasis/app test
```

### Deferred (M2b — not blocking M2a)

- Local Helper + pairing  
- Remaining adapters (anthropic, google, custom-http)  
- GEN family ops (`PromptLoom`, `Oracle`, `Icon`, `Antiphon`)  
- Provenance records UX  
- Encrypted-at-rest vault (session-only is §15.1 default)  

### Formal decision

When live UI demo above is accepted by bitmonk, mark M2a **closed** and open **M2b** (breadth).  
Boundary API is frozen enough for a single agent to own M2b adapters without reworking fetch/vault.

---

*a Manalive Tech project — M2a exit checklist*
