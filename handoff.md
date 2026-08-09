# Handoff — ICONOSTASIS (M2b in progress)

**Date:** 2026-08-09  
**Persona:** bitmonk  
**Spec:** `architecture.md` Draft **v0.3**  
**Sequencing:** `CRITICAL_PATH.md`  
**Process:** `AGENTS.md`

**Status: M2b IN PROGRESS** — GEN family + adapters + Local Helper + provenance landed. GEN/Icon
unblocked; demo driven live; **AMD-30 moved the M2 gate to cloud BYOK (OpenRouter)**. Blocking
M2 exit: an **evaluator rebuild storm on GEN arrival** that discards async operator state — see
part 4 below. Verify Oracle→OpenRouter on a real key after that is fixed.

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

> **Superseded by AMD-30.** This subsection is kept as history. `smoke-ollama.mjs` no longer
> exists (it is `smoke-provider.mjs`), `pnpm smoke:ollama` is `pnpm smoke:provider`, and
> `DEFAULT_OLLAMA` is `DEFAULT_OPENROUTER`. Do not chase these paths.

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
  > **Do not trust this as rebuild-storm evidence.** The replay had no GEN arrivals and no doc
  > mutation, which are exactly the conditions that trigger the storm found in part 4. A
  > regression harness for that defect must fire a GEN op and mutate a param.

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

### This session — Icon unblocked, and the demo driven end to end

**The GEN/Icon design decision is made and landed: option (1), a `backdrop` field input on
`OUT/Render` plus texture upload in the backend.** §5 (line 282) defines `field` as a
texture/render-target handle and §9.4 gives Icon a `field` output, so options (2) tint-the-
points and (3) preview-panel do not satisfy §18's "image→**texture**". The port is additive —
graph docs reference ports only through wires, so existing documents still load.

| Piece | Where |
|---|---|
| `GenFieldHandle` moved to the render substrate that consumes it | `engine/src/render/backdropField.ts` |
| `backdrop` field input; sent to the backend **every frame**, `undefined` included | `operators/out/render.ts` |
| `setBackdrop?()` on `RenderBackend` + recording in `MockRenderBackend` | `render/backend.ts` |
| Full-frame quad, decode, cover-fit, texture crossfade | `render/threeBackdrop.ts` (new) |
| Backdrop counts toward the flash-limiter luma proxy | `render/flashLimiter.ts` |
| Icon wired: Oracle text → `loom2` → Icon → `out1.backdrop` | `fixtures/m2OracleGraph.ts` |
| Mock `/v1/mock/chat/completions` (SSE + non-streaming) | `helper/src/mockGen.mjs` |
| `?spendCeiling=N` start-ceiling override | `app/src/gen/genHost.ts` |

Two notes on the render change:

- **The 1.2s crossfade in `threeBackdrop.ts` is a flash guard, not decoration.** `OUT/Render`'s
  rise-rate damper scales an exposure proxy for the *points*; it cannot dim a background
  texture. A swap that always takes 1.2s cannot strobe. Do not shorten it to zero (§16.4).
- `estimateLumaProxy` previously returned 0 whenever `hasGeometry` was false, so a
  backdrop-only frame was entirely undamped. It now takes `hasBackdrop`; geometry-only
  behaviour is unchanged and asserted.

**`?spendCeiling=N` exists because the hard stop was otherwise undemonstrable.** At the
50,000-token default, showing §18's hard spend stop costs 50,000 tokens. The override lowers
only the *starting* ceiling — raising it is still an explicit user action and the stop is the
same code path.

### M2 demo exit — driven live in-browser 2026-08-09

| §18 clause | Evidence |
|---|---|
| signals→prompt→**image→texture** | Icon → `out1.backdrop`; gold-ground nimbus renders behind the seraph, crossfades on re-fire |
| generated **voice** | `antiphon voiced: "The lamp answers along the rood before the dark." (2.9s)` |
| **armed/disarmed** in Perform | Disarmed fire refused: `GEN disarmed — Arm in Providers or Perform HUD`, spend unchanged at 155. Armed fire: 155 → 192 tokens |
| **hard spend stop** | `Session spend: 115/100 tokens · HARD STOP`; +ceiling released it and the next fire succeeded |

`POST /v1/mock/{chat/completions, audio/speech, images/generations}` → **200** on every armed
fire; zero console errors.

**Not satisfied: the Ollama leg.** §18 wants the text live *on the user's own key, including a
fully-local Ollama run*. **Ollama is not installed on this Mac** — `which ollama` fails. The
prior "Oracle → Ollama, direct from the browser → 200" evidence is from the **Windows** box
(hence the Windows Terminal section above). Everything verified this session used the mock
chat route. Re-run Enter → M2 demo → Fire Oracle on a machine with Ollama, with `oracle1`'s
`providerInstanceId` left **empty** (it resolves to `local-ollama`), before signing M2 off.

Observed, not a bug: repeated fires on an unchanging prompt do not re-voice. `GenAudioSink.present`
dedupes by token, and the mock line is deterministic per prompt, so the same utterance is
correctly not replayed. A real provider at temperature 0.7 varies the line.

### This session, part 4 — BYOK cloud-first (AMD-30), and a rebuild storm found

**Spec amendment AMD-30 landed** (`architecture.md` amendments table, §18 M2a/M2b, §19;
mirrored in `CRITICAL_PATH.md`). The M2 demo gate no longer names Ollama; it names a cloud
BYOK provider with **OpenRouter as the reference path**. §4.2's "including local inference
servers" is **unchanged and still true** — `openai-compat` is generic, so a user-supplied
`http://127.0.0.1:11434/v1` still works. The amendment narrowed the *gate*, not the product.

Why OpenRouter specifically: it resells Anthropic and xAI behind one OpenAI-compatible
endpoint, so a single user key reaches Claude and Grok with no vendor-specific adapter.

**Worth knowing before writing onboarding copy:** a Claude Pro/Max subscription and an
X Premium+ subscription are **not** API access. The Messages API needs a console-issued key
with its own billing; xAI is the same. There is no OAuth path that lets a browser app spend a
consumer subscription. §22's glossary blurs this ("credentials/subscriptions") — do not
promise subscription auth in UI copy.

| Change | Where |
|---|---|
| `DEFAULT_OLLAMA` → `DEFAULT_OPENROUTER` (keyless, `requireAuth: true`, not removable) | `app/src/gen/genHost.ts` |
| `isProviderUsable(id)` — `""` resolves to the first instance | same |
| Fire-Oracle status only warns when the resolved provider has no key | `app/src/main.ts` |
| openai-compat defaults now cloud-first; local servers documented, not default | `gen/src/adapters/openaiCompat.ts` |
| `smoke:ollama` → `smoke:provider` (env-driven, provider-agnostic) | `gen/scripts/smoke-provider.mjs` |
| Optional live test env-driven, not Ollama-specific | `gen/src/adapters/openaiCompat.live.test.ts` |
| BYOK panel copy; "Add openai-compat" hints the local-server path | `app/src/ui/providersPanel.ts` |

Two guards added: `genHost.test.ts` asserts the default ships keyless **and** that a local
inference server can still be registered — if that second test ever fails, AMD-30 has quietly
become a §4.2 pillar change.

**Verified in-browser:** registry shows OpenRouter (BYOK, no key, no Remove) + the mock; a
keyless fire fails closed with **no request leaving the browser** and a status line telling you
to bind a key or use `local-mock`; with `local-mock` the status is clean and Oracle→Antiphon
runs (`antiphon voiced: "Dust waits at the gate and does not fail." (2.9s)`).

#### Open defect: evaluator rebuild storm on GEN arrival (pre-existing, not from AMD-30)

The icon backdrop rendered reliably earlier in the session and then stopped. Chasing it turned
up the actual cause, and it is **not** in the backdrop code.

Evidence, one second of console:

```
12:51:09  antiphon voiced: "Dust waits at the gate…" (2.9s)
12:51:09  running · patched graph
12:51:09  antiphon voiced: "Dust waits at the gate…" (2.9s)   ← same utterance
12:51:09  running · patched graph
12:51:09  antiphon voiced: "Dust waits at the gate…" (2.9s)
12:51:09  running · patched graph
12:51:09  antiphon voiced: "Dust waits at the gate…" (2.9s)
```

`RuntimeHost.loop` calls `syncGraphIfNeeded()` **every frame**, which `JSON.stringify`s the
whole doc and calls `rebuildEvaluator()` on any difference. A rebuild constructs fresh operator
instances, which **resets GEN trigger state and discards `lastGoodValue`/`presented`**. So an
arrival that lands near a doc mutation re-fires the op, and `GEN/Icon.presented` is thrown away
before `OUT/Render` can read it — which is exactly why the backdrop is intermittent while the
audio leg (whose sink state lives on the host, not the graph) survives.

Two separate problems in there:
1. **Rebuilds destroy async operator state.** GEN ops must survive a rebuild, or the Arrival
   Law (§7.1 `lastGoodValue`) does not hold across ordinary editing.
2. **Per-frame `JSON.stringify` of the whole doc** is a §16.1 cook-budget problem on its own.

The earlier "1 evaluator rebuild, heap flat over 900 frames" measurement did **not** cover this
— it was a headless replay with no GEN arrivals and no doc mutation.

`ThreeBackdropLayer` now takes an `onDiagnostic` callback, surfaced by the app as `[icon] …`,
so a backdrop that fails to decode is no longer indistinguishable from one that never arrived.
That diagnostic is what made this findable; keep it.

### Explicit next

1. **Fix the evaluator rebuild storm** (see above) — this is now the top item. GEN operator
   state must survive `rebuildEvaluator()`, and `syncGraphIfNeeded` must stop stringifying the
   whole doc every frame. Touches `packages/app` runtime host and possibly engine cook state;
   `CRITICAL_PATH.md` §4 marks the cook/arrival surface one-writer, so do it alone.
2. **Then re-verify the Icon backdrop leg.** It rendered correctly earlier today (screenshotted,
   both edit and Perform) and the engine-side path has a passing test, but it cannot be signed
   off while rebuilds are discarding `presented`.
3. **Verify Oracle→OpenRouter on a real key** — the §18 text clause under AMD-30. Bind a key in
   Providers, leave `oracle1.providerInstanceId` empty, Fire Oracle. This is now doable on this
   Mac; it was not while the gate named Ollama.
4. Then `reviews/m2-exit.md` when the demo is accepted.
- Optional: Providers panel helper pair UX polish

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
pnpm helper     # Local Helper on :47821 — required for Icon and Antiphon
# optional:
pnpm smoke:provider  # ICONOSTASIS_SMOKE_BASE_URL/_MODEL/_API_KEY; any OpenAI-compat host
```

**Driving the full demo without Ollama** (what this Mac has to do): Enter → **M2 demo** →
select `oracle1` → set `providerInstanceId` to `local-mock` → **Fire Oracle**. To exercise
the hard spend stop, load `http://localhost:5173/?spendCeiling=100` — two fires land, the
third is refused, and **+ceiling** in the Providers panel releases it.

**GEN ops in palette:** `GEN/PromptLoom`, `GEN/Oracle`, `GEN/Icon`, `GEN/Antiphon`  
**Oracle:** empty `providerInstanceId` resolves to the first provider — the keyless OpenRouter
default, so bind a key first or set it to `local-mock`; bump `fire` to invoke.  
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
| engine | 160 |
| gen | 40 |
| helper | 17 |
| app | 15 |

*(engine 157 → 160 backdrop port + flash-limiter proxy; helper 14 → 17 mock chat route;
app 11 → 15 Icon wiring, GEN-reachability guard, BYOK-usability + local-inference-retained
guards.)*

The app guard is worth keeping: **`evaluator.tick` pull-evaluates from `family === "OUT"`
only, so a GEN op with no path to a sink never cooks at all.** That has silently disabled
Oracle once and Icon once. `m2OracleGraph.test.ts` now walks the wire graph and fails if any
`GEN/*` node cannot reach an `OUT/*` node, rather than trusting the wire list to look right.

---

*a Manalive Tech project — handoff (M2b in progress)*
