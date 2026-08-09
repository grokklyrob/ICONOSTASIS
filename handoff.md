# Handoff — ICONOSTASIS (M2b in progress)

**Date:** 2026-08-08  
**Persona:** bitmonk  
**Spec:** `architecture.md` Draft **v0.3**  
**Sequencing:** `CRITICAL_PATH.md`  
**Process:** `AGENTS.md`

**Status: M2b IN PROGRESS** — GEN family + adapters + Local Helper + provenance landed; full M2 live demo sign-off still open.

| Exit | Record |
|---|---|
| **M0** | accepted |
| **M1** | accepted |
| **M2a** | `reviews/m2a-exit.md` — accepted |
| **M2b** | In progress (breadth) |

---

## 0. Read this first — the terminal crashes are not the project

Repeated "the terminal crashes when running the demo" reports were **diagnosed to Windows
Terminal itself**, not to ICONOSTASIS. Do not spend another session hunting it in the code.

Windows Event Log, three crashes, all one fault bucket (`1416189573203534803`):

| Field | Value |
|---|---|
| Process | `WindowsTerminal.exe` 1.24.2607.10001 |
| Package | `Microsoft.WindowsTerminal_1.24.11911.0` — **1.24 Preview** channel (stable is 1.22.x) |
| Exception | `0xc000027b` `STATUS_STOWED_EXCEPTION`, via `Windows.UI.Xaml.dll` |
| Fault module | `combase.dll`, inner HRESULT `0x80070057` = `E_INVALIDARG` |
| Times | 20:36:32, 20:41:36, 20:47:03 |
| Prior 14 days | zero WindowsTerminal crashes |

Suspected contributor: `"adjustIndistinguishableColors": "always"` in WT settings, doing
per-cell color math under the heavy 24-bit ANSI that Vite/Vitest emit. **User is updating
Windows Terminal to try to clear it.** If crashes recur, check
`Get-WinEvent Application | Where Message -match 'WindowsTerminal'` *before* suspecting code.

**Corollary — `pnpm app` must be run backgrounded.** Foregrounded, a tool timeout kills it
and prints `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL … Exit status 143 … ELIFECYCLE`. That is just
SIGTERM (128+15), not a crash. Backgrounded, the same server ran 15+ minutes clean.

---

## 1. Where we left off

### Closed
- M0 Seed, M1 Instrument, M2a GEN boundary

### M2b landed previously

| Piece | Status |
|---|---|
| `GEN/PromptLoom` (sync template {{slots}}) | Done |
| `GEN/Oracle` (text stream/replace, GenCookHost) | Done |
| `GEN/Icon` (image.generate → gen-field handle) | Done |
| `GEN/Antiphon` (TTS + audio queue-to-cue) | Done |
| `registerM2Operators` + app wires GenHost into evaluator | Done |
| Adapters: anthropic, google, custom-http (+ openai-compat image/TTS) | Done |
| Provenance ledger on successful invoke → `.icx` pack | Done |
| `packages/helper` paired localhost proxy + tests | Done |
| Helper routing via `FetchBoundary.materialize` + HelperClient | Done |

### Prior session — diagnosis + two papercuts

No milestone progress. The demo exit is exactly where it was.

| Change | File |
|---|---|
| Removed duplicate `server` key (esbuild warned on every startup) | `packages/app/vite.config.ts` |
| Smoke default model `llama3.2` → `smollm:135m`, matching `DEFAULT_OLLAMA` | `packages/gen/scripts/smoke-ollama.mjs` |

`pnpm smoke:ollama` went from **exit 1 → exit 0**; only `smollm:135m` is pulled on this
machine, and the script now agrees with `packages/app/src/gen/genHost.ts:24`.

### Verified green while diagnosing

Everything project-side is healthy — re-confirmed, not assumed:

- Dev server ready in ~220ms, stable 15+ min, no warnings after the config fix
- Ollama live; the optional live-adapter test really hits it (1371ms)
- Headless replay of `RuntimeHost.loop` over the M2 demo graph — real engine, real
  `seraph.bin`, 900 frames: **1 evaluator rebuild, heap flat 22–26MB**. No cook runaway,
  no rebuild storm, no leak. (Harness was temporary and is deleted.)

### This session — `Buffer` on the browser paths (blocked Icon + Antiphon)

`packages/gen` is aliased to source by `packages/app/vite.config.ts` and bundled into the
browser. Two sites used Node's `Buffer`, which is **not polyfilled** — they throw
`ReferenceError: Buffer is not defined` in the browser on first arrival, while passing under
Vitest's Node runtime. This is why the Icon/Antiphon live path had never worked; 199 green
tests could not see it.

| Site | Broke |
|---|---|
| `openaiCompat.ts` `parseJsonResponse` image b64 decode | **Icon**, direct route |
| `runtime.ts` `executeViaHelper` binary decode | **Icon + Antiphon via helper** — i.e. the CORS fallback |

Fixes:

- New `packages/gen/src/bytes.ts` — `base64ToArrayBuffer` (accepts URL-safe) +
  `utf8ToArrayBuffer`. Both return a plain right-sized `ArrayBuffer`, not a view into a
  pooled buffer the way `Buffer.from` does.
- All four decode sites routed through it; `google.ts` and `customHttp.ts` had their own
  correct-but-duplicated `atob` inlines, now deduped.
- `bytes.test.ts` guards it: scans every non-test source in `packages/gen/src` for `Buffer.`
  (comments stripped) and fails. **A Node-only API on a browser path cannot be caught by
  running the tests — only by this kind of check.**
- Also fixed a **pre-existing** `pnpm typecheck:gen` / `typecheck:app` failure in
  `sha256.ts` (`Uint8Array<ArrayBufferLike>` not assignable to `BufferSource`). Both were
  red before this session; the handoff's "green" claim had not covered typecheck.

### This session — mock image/TTS endpoint + Antiphon actually sounds

Chose the mock route for Icon/Antiphon (§18 "or mock in UI"), then found the live path had
**three** further gaps beyond the decode bug.

**1. `packages/helper/src/cli.mjs` was a full copy of `server.ts`.** `pnpm helper` runs
`cli.mjs`; the tests exercise `server.ts`. Anything added to the tested file would not exist
in the file you run. Fixed by extracting the mock into `src/mockGen.mjs` — plain `.mjs`
because `cli.mjs` runs under bare node with no build step — and having **both** servers call
its `handleMockRequest`. Helper tsconfig now sets `allowJs` + `checkJs`, so `cli.mjs` is
typechecked for the first time (it had 7 latent implicit-`any` holes; fixed).

**2. Nothing consumed either GEN handle.** No app-side code touched `gen-field` or
`gen-audio`. Icon and Antiphon could both fetch successfully and produce nothing observable.

**3. An unwired GEN op never cooks.** `evaluator.tick` pull-evaluates only from
`family === "OUT"` sinks, so a GEN op that reaches no sink is never invoked at all — not a
silent no-op, simply never called. `OUT/AudioOut` (media + gain inputs) is the sink that
makes Antiphon reachable.

Landed:

| Piece | Where |
|---|---|
| Mock `/v1/mock/images/generations` (real PNG) + `/v1/mock/audio/speech` (real WAV) | `helper/src/mockGen.mjs` |
| Prompt-seeded output — changed prompt ⇒ changed texture/voice, so the demo reads as live | same |
| CORS on loopback origins + preflight, so the **direct** route works, not only the proxy | same |
| `local-mock` provider registered by default (`:47821/v1/mock`) | `app/src/gen/genHost.ts` |
| `GenAudioSink` — decodes arrivals, replacement-not-overlap, click-free gain ramp | `app/src/gen/genAudioSink.ts` |
| Playback driven from `OUT/AudioOut.lastState` so master gain/mute apply | `app/src/engine/runtimeHost.ts` |
| `GraphEvaluator.getInstance` — host access to sink state (§11.1) | `engine/src/cook/evaluator.ts` |
| Demo graph: Oracle `text`→Antiphon, Oracle `complete`→trigger, `media`→AudioOut | `app/src/fixtures/m2OracleGraph.ts` |

Verified: PNG served by the running `cli.mjs` decodes to an actual gold-ground nimbus (opened
it); WAV is 16-bit mono PCM, `RIFF`, correct sizes. `typecheck` clean for engine/gen/app/
helper. **Not browser-verified** — see below.

Two notes for whoever picks this up:

- The generated voice routes through the **analyser**, so it drives the visuals — and
  therefore feeds the band energy that builds the next prompt. That loop is deliberate but
  unproven at length; watch it during sign-off.
- `GEN/Antiphon` has an `audioPlaying` param that its queue-to-cue logic reads, and the host
  now genuinely knows the answer (`GenAudioSink.isPlaying()`). It is **not** wired back,
  because writing a param from the render loop would churn the doc and force evaluator
  rebuilds. Cue-boundary behaviour is therefore still only proven by the M1 synthetic probe.

### This session, part 3 — browser-verified, and three more real bugs

Drove the demo in a real browser (Claude-in-Chrome). "Enter does nothing" was **not** a
Windows Terminal issue and not a WebGL issue — it was a JS exception during module
evaluation. Three distinct bugs, all only findable by running it:

**1. `armingHud` recursed until the stack blew.** `render` was registered via
`gen.subscribe(render)` *and* called `gen.syncMode(mode)` inside itself → `emit` → `render` →
`RangeError: Maximum call stack size exceeded`. It threw at `mountArmingHud`, so every
listener registered after that line — **including `enter.addEventListener`** — was never
attached. Hence a completely dead Enter button. Fixed by making `render` read-only (mode sync
is already `main.ts`'s job on the store subscription) and making `GenHost.syncMode`
early-return when the mode is unchanged, so a write-in-listener can't loop again.

**2. `GEN/Antiphon` and `GEN/Icon` threw on every cook.** Both filter `stream` out of their
param specs but still call `readGenCommonParams`, which reads it, and the evaluator throws on
unknown param ids. `readGenCommonParams` now reads `stream` defensively.

**3. The `complete` pulse was destroyed before anyone could see it.** `GEN/Oracle` sets
`completePulse = true` inside its async `.then()`, which resolves *between* frames — and the
next `cook` opened with `completePulse = false`, wiping it before `setOutput`. So Oracle's
`complete` **never fired downstream, ever**. `GEN/Antiphon` had the identical bug. Both now
latch into `pendingComplete` and drain it at the top of cook. Caption kept working throughout
because it reads `text`, not `complete` — which is exactly why this hid.

**Also discovered: `LIT/Caption` is family `LIT`, not `OUT`, so it is not a sink.** The
original demo graph ended `oracle1 → caption1` with nothing downstream, so **Oracle never
cooked and Fire Oracle did nothing at all** — the button bumped a param into a graph that was
never pulled. The `antiphon1 → audioout1` chain added this session is what gives that subtree
a sink. Worth auditing other fixtures for dangling LIT tails.

**Verified live in-browser, end to end:**

| Step | Evidence |
|---|---|
| Enter arms audio + viewport | seraph renders, audio-reactive |
| Oracle → Ollama, **direct from the browser** | `POST 127.0.0.1:11434/v1/chat/completions` → **200** |
| Oracle `complete` → Antiphon trigger | Antiphon invoked |
| Antiphon → mock TTS | `POST 127.0.0.1:47821/v1/mock/audio/speech` → **200** |
| WAV decoded + sounded through master bus | `[app] antiphon voiced: "…" (8.0s)` |

**The CORS "known unknown" is resolved: there is no CORS problem.** Ollama accepted the
`localhost:5173` origin directly — no `OLLAMA_ORIGINS` change, no helper proxy needed for the
text path. The Providers panel still warns about it; that copy is now misleading and should
be softened.

Counts after: engine **157**, gen 40, helper 14, app 11. All typechecks clean.

### Still open for M2 *demo* exit (§18)

> *signals→prompt→image→texture and generated voice, live, on the user's own key — including fully-local Ollama; armed/disarmed; hard spend stop.*

1. ~~Graph demo: AudioIn/LFO → PromptLoom → Oracle (Ollama) live~~ **done, browser-verified**
2. Antiphon vs mock TTS ~~done, browser-verified~~; **Icon still blocked** — see below
3. Bitmonk UI sign-off: Perform disarm/arm + spend hard-stop — **not yet driven**; only edit
   mode was exercised. Perform arms separately and the spend meter is untested live.
4. Optional: Providers panel helper pair UX polish (+ fix the now-wrong CORS warning copy)

### Explicit next

- ~~M2 demo graph fixture~~ (`fixtures/m2OracleGraph.ts` + chrome **M2 demo** / **Fire Oracle**)
- Live bitmonk: Enter → M2 demo → Fire Oracle (Ollama) → Perform arm/disarm
- ~~Antiphon live path~~ — mock endpoint + `OUT/AudioOut` playback landed; needs browser
  sign-off (`pnpm helper` must be running).
- **GEN/Icon is blocked on a design decision, not on code.** Its `field` output has nowhere
  to land: `OUT/Render`'s four `field` inputs are all post-FX slots (bloom, godrays, grain,
  vignette) and `threeWebGLBackend` has no texture path at all. §18 asks for
  "image→**texture**", so this needs one of:
  1. a colour/backdrop `field` input on `OUT/Render` + texture upload in the backend;
  2. generated image as point-cloud colour source (tints the seraph);
  3. an app-side preview panel only — proves arrival, does **not** meet §18's wording.
  (1) and (2) touch `OUT/Render` / render-tier, which `CRITICAL_PATH.md` §4 marks
  **one-writer**. Decide before opening that file.
- Then `reviews/m2-exit.md` when demo accepted

~~**Known unknown for the live path:** CORS on the direct Ollama route.~~ **Resolved
2026-08-08:** verified in-browser, `POST 127.0.0.1:11434/v1/chat/completions` from
`localhost:5173` returns 200 with no `OLLAMA_ORIGINS` change. Ollama allows loopback origins.
The helper proxy is still the path for cloud providers with real keys, but the local text
demo does not need it. The Providers panel's warning copy is now misleading — soften it.

---

## 2. How to resume

```bash
pnpm install
pnpm --filter @iconostasis/engine test   # 157
pnpm --filter @iconostasis/gen test      # 40
pnpm typecheck && pnpm typecheck:gen && pnpm typecheck:app   # run these — tests alone miss browser-only breakage
pnpm --filter @iconostasis/helper test   # 14
pnpm --filter @iconostasis/app test      # 11
pnpm app        # background it — see §0
# optional:
pnpm helper          # Local Helper on :47821
pnpm smoke:ollama    # defaults to smollm:135m
```

**GEN ops in palette:** `GEN/PromptLoom`, `GEN/Oracle`, `GEN/Icon`, `GEN/Antiphon`  
**Oracle:** set `providerInstanceId` empty to use first capable provider (local-ollama); bump `fire` to invoke.  
**Perform:** GEN disarmed by default — Arm in HUD; invokes go through same GenRuntime.

**Helper:**
```bash
pnpm helper
# pair: POST http://127.0.0.1:47821/pair {"token":"<≥8 chars>"}
# set provider routing: helper + GenHost.setHelper / pairHelper
#
# mock GEN (no pairing, CORS-open on loopback) — required for Antiphon:
#   http://127.0.0.1:47821/v1/mock  → /images/generations, /audio/speech
```

**Antiphon demo:** `pnpm helper` **and** `pnpm app` → Enter → M2 demo → Arm → Fire Oracle.
Ollama writes the line, `local-mock` speaks it through `OUT/AudioOut`. No helper running ⇒
Antiphon errors on connect while Oracle still works.

---

## 3. Architecture notes (frozen)

- Engine never imports `@iconostasis/gen` — only `GenCookHost` interface
- Player must **not** call `setGenHost`
- Adapters still never `fetch`; boundary + optional helper only
- PromptLoom is sync (no host required)

---

## 4. Counts

| Package | Tests |
|---|---|
| engine | 157 |
| gen | 40 |
| helper | 14 |
| app | 11 |

*(engine 153 → 157 `genCookSmoke.test.ts`; gen 35 → 40 `bytes.test.ts`; helper 2 → 14
`mockGen.test.ts`; app 9 → 11 fixture wiring.)*

---

*a Manalive Tech project — handoff (M2b in progress)*
