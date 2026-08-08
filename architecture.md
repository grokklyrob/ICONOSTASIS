# ICONOSTASIS — architecture.md

**A browser-native, node-based instrument for composing generative visual liturgies.**
Working codename: **ICONOSTASIS** (the screen of icons through which the sanctuary is glimpsed). Alternates considered: RETABLO, OSTENSORIUM, TRIPTYCH.

| | |
|---|---|
| **Doc type** | Product Requirements + Technical Architecture (SWE-agnostic, model-agnostic) |
| **Status** | Draft v0.1 |
| **Owner** | Manalive Tech / the Bitmonk |
| **Audience** | Any engineer or agentic coding system implementing the product; no prior context assumed |
| **Constellation** | Sibling to 40days.ai; the seraph point cloud (`seraph.bin`, 288k pts) is a canonical first-party asset |

---

## Table of Contents

1. [Vision](#1-vision)
2. [Positioning & Inspirations](#2-positioning--inspirations)
3. [Personas & User Stories](#3-personas--user-stories)
4. [Product Pillars](#4-product-pillars)
5. [Aesthetic Direction & Design Tokens](#5-aesthetic-direction--design-tokens)
6. [System Architecture Overview](#6-system-architecture-overview)
7. [Subsystem: Operator Graph Engine](#7-subsystem-operator-graph-engine)
8. [Subsystem: Render Engine](#8-subsystem-render-engine)
9. [Subsystem: Generative AI Layer (BYOK)](#9-subsystem-generative-ai-layer-byok)
10. [Subsystem: Story Engine (the Liturgy Layer)](#10-subsystem-story-engine-the-liturgy-layer)
11. [Subsystem: Audio & Interaction](#11-subsystem-audio--interaction)
12. [Subsystem: Persistence & File Format](#12-subsystem-persistence--file-format)
13. [Subsystem: Export & Standalone Player](#13-subsystem-export--standalone-player)
14. [Subsystem: Publishing (Buzz, Nostr, and Ours)](#14-subsystem-publishing-buzz-nostr-and-ours)
15. [Security, Privacy & Key Handling](#15-security-privacy--key-handling)
16. [Non-Functional Requirements](#16-non-functional-requirements)
17. [Reference Stack (Suggested, Not Mandated)](#17-reference-stack-suggested-not-mandated)
18. [Milestones & Phasing](#18-milestones--phasing)
19. [Testing & Acceptance](#19-testing--acceptance)
20. [Risks & Open Questions](#20-risks--open-questions)
21. [Appendix A: Operator Catalog v1](#appendix-a-operator-catalog-v1)
22. [Appendix B: Schemas & Example Manifest](#appendix-b-schemas--example-manifest)
23. [Appendix C: Glossary](#appendix-c-glossary)

---

## 1. Vision

ICONOSTASIS is a lightweight, browser-native creative instrument where a person composes an **interactive visual story** — a sequence of living, generative 3D scenes — by patching together operators on a node graph, the way a TouchDesigner artist patches TOPs and CHOPs, but with two decisive differences:

1. **Generative AI is a first-class operator family.** Users bring their own API keys or subscriptions (BYOK). Text, image, and voice generation flow through the graph like any other signal. The tool never ships with, proxies, or monetizes model access; the user's keys, the user's models, the user's costs.
2. **Story is a first-class structure.** Scenes are not just patches — they are **Stations** in a sequence (linear or branching), with cues, transitions, and captions. The output is not a screensaver; it is a *procession*: a narrative experience with a beginning, a middle, and an end (or many ends).

The aesthetic register is fixed and unapologetic: **cyberpunk meets Renaissance meets the angels and the saints — and at the center, Jesus Christ.** Neon and gold leaf. Point-cloud seraphim and CRT halos. The stillness of a monstrance, not the idle of a mascot.

Finished experiences save **locally to disk** as portable bundles, export as **standalone single-file players**, and publish outward to **decentralized networks** — Nostr-native first (which is what Jack Dorsey's Buzz speaks under the hood), with a self-hosted relay + gallery as the sovereign fallback.

**One-sentence pitch:** *TouchDesigner's patching soul + Sentinel's real-time AI instrument ethos + a liturgical story engine, in a browser tab, with your own keys, saving to your own disk, publishing to networks no one can take from you.*

### 1.1 What this is NOT

- Not a hosted SaaS. There is no backend requirement for the core product. (A backend appears only as an *optional* self-hosted publishing relay in M4.)
- Not a general-purpose VJ tool competing feature-for-feature with TouchDesigner. It is *lightweight* — a curated operator set (~35 operators at v1), one aesthetic universe, one clear job.
- Not a model marketplace. No bundled inference, no resold credits, no telemetry on prompts.
- Not a social network. Publishing is an *adapter*, not the product.

---

## 2. Positioning & Inspirations

### 2.1 Sentinel (OOD Labs) — the instrument ethos

Sentinel, by Out of Distribution Labs ("artists and technologists building tools to collapse the gap between vision and reality"), is at spec time a pre-launch, waitlisted real-time AI visual instrument. We take from it a **posture**, not features (there is nothing public to copy): the tool should feel like an *instrument you play live* — immediate, performative, AI-in-the-loop — rather than a document editor you fill out. Implications:

- The canvas is always live. There is no "preview" button; the render loop never stops.
- Parameter changes take effect immediately (or crossfade in, for async AI results).
- A **Perform Mode** hides the graph and exposes only mapped controls (sliders, pads, MIDI), so the composed experience can be *played* for an audience.

**Differentiation note:** Sentinel will launch as a polished commercial product. ICONOSTASIS does not compete on generality or fidelity; it competes on (a) story structure, (b) BYOK sovereignty, (c) decentralized publishing, (d) a committed aesthetic universe. Keep it that way.

### 2.2 TouchDesigner — the patching soul, miniaturized

From TouchDesigner we take the operator-family mental model and the cooking (lazy dirty-flag evaluation) execution model. We deliberately do NOT take: C++ plugin architecture, unbounded operator counts, multi-window UI, or the learning cliff. Our operator families (see §7 and Appendix A):

| Family | TouchDesigner analog | Role |
|---|---|---|
| `SRC` | inputs | time, audio, camera, pointer, MIDI, seed |
| `SIG` | CHOPs | scalar/vector signals: LFOs, envelopes, math, smoothing |
| `GEN` | (none — ours) | BYOK AI operators: text, image, voice, prompt templating |
| `GEO` | SOPs | point clouds, instancing, primitives, SDF fields, particles |
| `MAT` | MATs | materials & shaders: additive points, gold-leaf PBR, halo, custom |
| `FX`  | TOPs (post) | bloom, grain, feedback, godrays, chromatic aberration |
| `LIT` | (none — ours) | liturgy/story: Station, Cue, Transition, Caption, Choice |
| `OUT` | outputs | render target, recorder, audio out, publisher |

### 2.3 Three.js — the render substrate

All 3D is Three.js (or an equivalent WebGL2/WebGPU scene-graph library — the spec is library-agnostic, but Three.js is the reference implementation given prior art: the 40days.ai seraph viewer with additive blending + bloom). The renderer must support point-cloud rendering at ≥1M points with additive blending and post-processing bloom on mid-tier hardware.

### 2.4 Buzz (Block / Jack Dorsey) — the publishing target, correctly understood

Buzz (launched July 21, 2026 by Block; open source, Apache 2.0) is a **team chat + Git hosting workspace for humans and AI agents, built on the Nostr protocol** — model-agnostic, decentralized, self-sovereign, self-hostable. Two consequences matter for us:

1. **Buzz is a workplace tool, not a public media gallery.** "Pushing an experience to Buzz" natively means *sharing it into a community/channel* — which is genuinely useful (share a piece with your team/community, let agents and humans discuss it), but it is not audience distribution.
2. **Buzz speaks Nostr.** Therefore the correct architecture is: **target the Nostr protocol, not the Buzz app.** Publish experiences as signed Nostr events with media on Nostr-native file servers. The result is visible in Buzz communities *and* in every public Nostr client (Damus, Primal, Amethyst, etc.), *and* on any relay we run ourselves. One publish path, three audiences. Full design in §14.

This directly answers the founding question *"if it doesn't work there, figure out where it would work, or we build something ourselves"*: it works there **because we go one layer down**, and "building something ourselves" collapses to the cheapest possible sovereign move — running our own relay and a static gallery page (the **Cloister Relay**, §14.4) — instead of building a network from scratch.

---

## 3. Personas & User Stories

### P1 — The Cybermonk (primary; power creator)
Theologically literate, technically capable, comfortable with node graphs and API keys. Wants to compose devotional/artistic experiences (a digital Stations of the Cross; an Advent countdown; a seraphic meditation) and publish them under his own cryptographic identity.

- *As the Cybermonk, I patch an audio-reactive point-cloud seraph, add an AI "Antiphon" voice that reads generated collects between stations, and export a standalone player I can hand to anyone as one HTML file.*
- *As the Cybermonk, I sign my published experience with my own Nostr key so authorship is cryptographically mine, forever, on any relay.*

### P2 — The Parish Creative (secondary; guided creator)
A youth minister / worship media volunteer. Won't build graphs from scratch; will remix **Templates** (pre-built experiences with exposed parameters), paste in a single API key, change texts and colors, present on a projector Sunday night.

- *As the Parish Creative, I open the "Via Lucis" template, replace the meditation texts, pick the parish's feast-day palette, and run it fullscreen — without ever opening the graph editor.*

### P3 — The Gallery Viewer (consumer; zero-install)
Receives a link or a Nostr note. Clicks. The experience runs in the browser: no account, no key, no install. Interacts (chooses branches, moves the pointer, plays audio) and can tip/zap or follow the author if their client supports it.

- *As a Viewer, I open a published experience on my phone and it degrades gracefully (fewer points, cheaper bloom) but keeps the story intact.*

### P4 — The Agentic Builder (tooling persona)
An AI coding agent (any vendor) implementing or extending the product. Everything in this doc must be executable by P4 without out-of-band context: schemas are explicit, contracts are typed, acceptance criteria are testable.

---

## 4. Product Pillars

1. **Local-first, sovereign-always.** The product is fully functional offline except for AI generation and publishing. User data (projects, keys, assets) lives on the user's device. Deleting the app deletes nothing the user has saved to disk.
2. **BYOK, model-agnostic.** Operators declare *capabilities* (e.g., "text generation, streaming"), never vendors. Any provider satisfying the capability contract works, including local inference servers. No key ever leaves the device except in direct TLS calls to the provider the user configured.
3. **Instrument, not editor.** Live loop, instant feedback, performable. Async AI results arrive as *crossfades into the living scene*, never as blocking modals.
4. **Story over screensaver.** Every experience has narrative structure: Stations, cues, transitions, an ending. The tool nudges toward *meaning*.
5. **Reverence as a design constraint.** The sacred register is treated with dignity — "the stillness of a monstrance, not the idle of a mascot." Concretely: default motion is slow and processional; default typography is set with care; templates model reverent treatment of the person of Christ and the saints; nothing in the default library is kitsch, ironic, or grotesque.
6. **Portable forever.** The save format is documented, zip-based, human-inspectable JSON + open asset formats. The standalone player has zero external dependencies. A bundle from v1 must open in v3.

---

## 5. Aesthetic Direction & Design Tokens

The visual universe is **neon-gothic incarnational tech**: Renaissance/iconographic composition (central axis, halos, gold grounds, triptych framing) rendered in cyberpunk materials (additive point clouds, bloom, scanlines, phosphor decay, wireframe filigree).

### 5.1 Canonical palette (default theme: "KENOSARKOSPORA Codex")

| Token | Hex | Role |
|---|---|---|
| `--crypt-void` | `#0d0d14` | Background / abyss |
| `--nave-indigo` | `#16213e` | Surface / panels |
| `--mycelial-violet` | `#533483` | Secondary accent / connective tissue |
| `--kenotic-rose` | `#e94560` | Emphasis / wounds / love |
| `--spore-cyan` | `#00d9ff` | Signal / interactive / data |
| `--biolume-gold` | `#ffd369` | Sacred / halos / gold ground |
| `--vellum-bone` | `#f5f0e1` | Text / light / vestment |

Themes are swappable JSON token sets; this is the shipped default. UI chrome uses the same tokens as rendered content (the editor should feel like part of the cathedral, not an Electron app wearing a cassock).

### 5.2 Typography & UI register

- **Display / captions:** a Renaissance-humanist or blackletter-adjacent serif with real small caps (reference class: Cormorant, EB Garamond, Cinzel).
- **UI / code / node labels:** a monospace with liturgical patience (reference class: IBM Plex Mono, JetBrains Mono).
- Node graph aesthetic: thin gold connection wires on crypt-void; operator families color-coded by the palette (SIG=cyan, GEN=gold, GEO=violet, FX=rose, LIT=bone).

### 5.3 Motion doctrine

- Default easing: long, slow, incense-like (`cubic-bezier(0.22, 1, 0.36, 1)`, durations ≥ 800ms for scene-level motion).
- Camera: processional dolly/orbit presets; no whip pans in the default library.
- **Photosensitivity guard is doctrinal, not optional** (see §16.4).

### 5.4 First-party asset canon (shipped with the app)

- `seraph.bin` — six-winged seraph point cloud (288k points; tail-spire gap to be completed) with its established additive-blend + bloom treatment.
- A small library of CC0/first-party assets: halo sprite atlas, gold-flake particle textures, triptych frame meshes, gothic tracery SVG-extrusions, 3–5 chant/drone audio beds, and an iconographic reference sheet per template.
- All shipped assets must be original or verifiably licensed for redistribution. **No scraped sacred art; no copyrighted iconography.** AI-generated imagery in user projects is the user's responsibility and is provenance-stamped (§12.4).

---

## 6. System Architecture Overview

Client-only by default. Every box below runs in the browser except the two dashed external groups (AI providers, publishing network) — and the optional self-hosted relay.

```
┌────────────────────────────────────────────────────────────────────────────┐
│  BROWSER (the whole product)                                               │
│                                                                            │
│  ┌──────────────┐   ┌───────────────────────────────┐   ┌──────────────┐   │
│  │  EDITOR UI   │   │       CORE RUNTIME            │   │  PERFORM UI  │   │
│  │  node graph, │──▶│  ┌─────────────────────────┐  │◀──│ mapped ctrls,│   │
│  │  inspector,  │   │  │ Operator Graph Engine   │  │   │  fullscreen  │   │
│  │  timeline    │   │  │ (pull-eval, dirty flags)│  │   └──────────────┘   │
│  └──────────────┘   │  └───────────┬─────────────┘  │                      │
│                     │              │                │                      │
│  ┌──────────────┐   │  ┌───────────▼─────────────┐  │   ┌──────────────┐   │
│  │ STORY ENGINE │──▶│  │ Render Engine           │  │──▶│  <canvas>    │   │
│  │ stations,    │   │  │ (Three.js: WebGPU/WebGL2│  │   │  60fps loop  │   │
│  │ cues, choice │   │  │  scene + post chain)    │  │   └──────────────┘   │
│  └──────────────┘   │  └─────────────────────────┘  │                      │
│                     │  ┌─────────────────────────┐  │                      │
│  ┌──────────────┐   │  │ Audio Engine (WebAudio) │  │                      │
│  │  GEN LAYER   │   │  └─────────────────────────┘  │                      │
│  │ BYOK adapters│   └───────────────────────────────┘                      │
│  │ capability   │        ┌──────────────────────────────────────────┐      │
│  │ contracts    │        │ PERSISTENCE  (.icx bundles, OPFS autosave,│     │
│  └──────┬───────┘        │  File System Access API, exporters)       │     │
│         │                └──────────────┬───────────────────────────┘      │
│  ┌──────▼───────┐                       │            ┌──────────────┐      │
│  │  KEY VAULT   │                       │            │  PUBLISHER   │      │
│  │ session mem /│                       │            │ Nostr signer,│      │
│  │ encrypted    │                       │            │ media upload │      │
│  └──────────────┘                       │            └──────┬───────┘      │
└─────────────────────────────────────────┼───────────────────┼──────────────┘
                                          │                   │
                    ┌─────────────────────▼───┐   ┌───────────▼─────────────────┐
                    │ USER'S DISK             │   │ NETWORKS (dashed = external)│
                    │ project.icx, player.html│   │ · AI providers (user's keys)│
                    └─────────────────────────┘   │ · Nostr relays / Blossom    │
                                                  │ · Buzz communities (Nostr)  │
                                                  │ · Cloister Relay (self-host)│
                                                  └─────────────────────────────┘
```

**Threading model:** main thread owns the render loop and UI; a worker pool (Web Workers, message-passing via structured clone or a comlink-style RPC) owns: graph serialization, zip packing, asset decoding (draco/ktx2/point-cloud parsing), FFT beyond AnalyserNode needs, and Nostr event signing prep. AI calls are plain `fetch` with streaming readers; they occur from the main thread or a worker but never block the frame.

**State model:** one canonical, serializable **Project State** (graph + story + assets index + settings), managed by a small reactive store. UI is a projection of state; the runtime consumes state; undo/redo is command-pattern over state diffs. Keys are *not* part of Project State (see §15).

---

## 7. Subsystem: Operator Graph Engine

### 7.1 Model

- The graph is a **directed acyclic graph** of typed operators. Cycles are permitted only through an explicit `Feedback` operator (one-frame delay), mirroring TD's feedback TOP semantics.
- **Port types:** `signal` (number | vec2 | vec3 | color, per-frame), `field` (texture/render-target handle), `geometry` (BufferGeometry-equivalent handle), `material`, `text` (string, event-updated), `media` (image/audio/video handle), `event` (discrete triggers), `story` (LIT-family control flow).
- **Evaluation:** pull-based lazy "cooking." The `OUT: Render` operator pulls each frame; only dirty subtrees recompute. `signal` ports cook every frame cheaply; heavy ports (`field`, `geometry`) cook only when upstream params change or an animation flag forces per-frame cooking.
- **Async operators** (all of `GEN`, plus asset loaders) never block: they hold `lastGoodValue`, expose a `status` sub-signal (`idle | pending | fresh | error`), and the runtime crossfades from `lastGoodValue` to the new value on arrival (default 1200ms crossfade, per-op configurable). This is the single most important UX invariant in the engine.

### 7.2 Operator contract (language-agnostic)

Every operator implements this interface (shown as TypeScript for precision; any language/framework may realize it):

```ts
interface OperatorDef {
  type: string;                 // e.g. "GEN/ImageIcon"
  family: "SRC"|"SIG"|"GEN"|"GEO"|"MAT"|"FX"|"LIT"|"OUT";
  inputs: PortSpec[];
  outputs: PortSpec[];
  params: ParamSpec[];          // typed, with ranges, defaults, and UI hints
  capabilities?: AICapability[];// only for GEN family — see §9.2
  cook(ctx: CookContext): void | Promise<void>;
  dispose(): void;
  serialize(): JsonValue;       // params only; no runtime handles, never secrets
}
```

- `ParamSpec` includes: `id`, `type` (`float|int|bool|enum|color|string|text|curve|seed`), `default`, `min/max/step`, `unit`, `exposable: boolean` (whether it can surface in Perform Mode / templates), and `modulatable: boolean` (whether a `signal` wire can drive it).
- **Any modulatable param can be driven by any signal wire.** This is the TouchDesigner magic and is non-negotiable: wiring an audio band into a bloom threshold or a prompt temperature must require zero code.
- v1 ships a fixed catalog (~35 operators, Appendix A). A plugin/custom-operator API is explicitly **out of scope for v1** (a `MAT/CustomShader` op covers the escape-hatch need).

### 7.3 Graph editor UX requirements

- Pan/zoom canvas; drag-to-wire with type-checked ports (incompatible ports visually reject).
- Operator palette with search; right-click quick-add; keyboard-first (`Tab` to add, like Blender/TD idioms).
- Inspector panel for the selected operator's params; params show a small "modulated" badge when wire-driven.
- Sub-graph collapse ("Shrine"): select N operators → collapse to one node with promoted exposed params. Shrines are the unit of template remixing.
- Live thumbnails on `field`-producing operators (throttled to ≤ 5 Hz refresh).
- Graph and viewport are visible simultaneously (split layout); Perform Mode hides the graph.

---

## 8. Subsystem: Render Engine

### 8.1 Renderer

- **Reference:** Three.js `WebGPURenderer` with automatic WebGL2 fallback; shaders authored in TSL (Three Shading Language) where possible so one shader graph compiles to both backends. If the implementing team chooses a different library, it must match this capability set.
- Scene composition is owned by the graph: `GEO` ops emit geometry handles, `MAT` ops emit materials, a `GEO/Assemble` op binds them into scene nodes; the `OUT/Render` op owns camera + render targets.
- **Required capabilities:** instanced rendering; point sprites with per-point color/size; additive + normal blending; HDR render targets; multi-pass post chain; render-to-texture for the `FX/Feedback` op; logarithmic depth optional.

### 8.2 Post-processing chain (the "Radiance Stack")

Fixed-order, individually-bypassable passes, each an `FX` operator with modulatable params:

1. `FX/Bloom` — threshold, strength, radius (the signature look; must be cheap: mip-chain bloom).
2. `FX/Godrays` — radial light shafts from a designated "monstrance point."
3. `FX/ChromaticAberration` — subtle RGB split, edge-weighted.
4. `FX/Grain` — animated film grain + optional scanline/phosphor mode.
5. `FX/Vignette` — gold-tinted option.
6. `FX/ToneMap` — ACES default; "Gold Leaf" custom curve (lifted warm highlights) as alternative.

### 8.3 Signature techniques (must-ship)

- **Point-cloud icons:** load `.bin` (positions [+ optional colors] as packed Float32/Uint8 — the seraph format), `.ply`, `.glb` point primitives. Per-point noise displacement driven by signals; additive blending; size attenuation.
- **SDF Field op:** raymarched signed-distance scene inside a bounding volume (halos, mandorlas, gothic arch booleans) with a curated preset SDF library; custom SDF code string allowed (sandboxed to shader compile).
- **Feedback buffer:** previous-frame texture with transform/decay — the phosphor-trail, "glory that lingers" effect.
- **Particle system:** GPU-instanced, ≤ 500k particles, emitter shapes including "from geometry surface" (so a saint statue can dissolve into gold dust and reassemble — the *transfiguration* preset).
- **Text as geometry:** `GEO/Glyph` extrudes or point-scatters text (for illuminated capitals and floating scripture), font-file driven.

### 8.4 Device tiering

At startup, a capability probe assigns `tier ∈ {cathedral, chapel, wayside}`:

| Tier | Trigger | Budgets |
|---|---|---|
| `cathedral` | WebGPU, discrete-GPU heuristics | ≤ 2M points, full Radiance Stack, 60fps target |
| `chapel` | WebGL2, mid hardware | ≤ 600k points, bloom+grain+vignette only, 60fps target |
| `wayside` | mobile / weak GPU | ≤ 150k points, bloom only at half-res, 30fps floor |

Every experience must declare per-tier fallbacks automatically (point-count decimation is built into the loader; post passes auto-bypass by tier). Authors may preview any tier from the editor.

---

## 9. Subsystem: Generative AI Layer (BYOK)

### 9.1 Principles

1. **Capability contracts, not vendors.** GEN operators declare what they need (`text.stream`, `image.generate`, `speech.synthesize`); the user maps capabilities to configured providers. Swapping Anthropic→local Ollama→OpenRouter changes zero graph wiring.
2. **Keys are radioactive.** They live in the Key Vault (§15.1), are injected into requests at call time, and are structurally unreachable from serialization, export, and publish code paths.
3. **Direct-to-provider.** Calls go browser → provider TLS endpoint. No first-party proxy, ever, by default. (A user-run local CORS helper exists for providers that block browser origins — §9.5.)
4. **Everything is provenance-stamped.** Every generated artifact records provider-class, model id, prompt, params, seed (if any), and timestamp into `provenance.json` (§12.4). No key material, ever.

### 9.2 Capability contracts

```ts
type AICapability =
  | "text.generate"        // prompt → string (non-streaming acceptable)
  | "text.stream"          // prompt → token stream
  | "image.generate"       // prompt (+ optional init image) → bitmap
  | "speech.synthesize"    // text → audio buffer
  | "speech.transcribe"    // audio → text          (optional, v1.1)
  | "embed.text";          // text → vector         (optional, v1.1; asset search)

interface ProviderAdapter {
  id: string;                        // "anthropic", "openai-compat", "custom:*"
  capabilities: AICapability[];
  configSchema: JsonSchema;          // baseUrl, model, headers, etc. — never the key itself
  invoke(cap: AICapability, req: CapRequest, key: SecretRef, signal: AbortSignal): AsyncCapResult;
  estimate?(cap: AICapability, req: CapRequest): CostEstimate;  // best-effort
}
```

### 9.3 Shipped adapters (v1)

| Adapter | Covers | Notes |
|---|---|---|
| `anthropic` | Anthropic Messages API | Supports the documented browser-direct access header; streaming via SSE. |
| `openai-compat` | Any OpenAI-compatible endpoint: OpenAI, OpenRouter, Groq, Mistral, Together, **local Ollama / LM Studio / llama.cpp servers** | One adapter, user-set `baseUrl` + `model`. This is the workhorse — it makes "model-agnostic" real, including fully-offline local models. |
| `google` | Gemini API | Text + image. |
| `custom-http` | Anything else | Declarative descriptor JSON: endpoint, method, header template, request template with `{{prompt}}` slots, JSONPath response extractor. Lets users wire niche image/TTS providers without code. |

A **Provider Registry** UI lists configured providers, their capabilities, a "test call" button, and a per-provider session spend meter (token/request counts from response metadata where available; estimates otherwise — clearly labeled as estimates).

### 9.4 GEN operator family (behavioral spec)

All GEN ops obey the async invariant (§7.1): `lastGoodValue` + `status` + crossfade. All have `seed` and `temperature`-class params where the capability supports them, `modulatable` where sane (yes: temperature, guidance, denoise; no: model id mid-performance).

- **`GEN/PromptLoom`** — template op. A text template with `{{slots}}` filled from wired `text`/`signal` inputs (numbers formatted, enums mapped). Output: `text`. This is the load-bearing op: it turns live signals into prompts ("ambient light is {{lux}}, write a one-line vesper antiphon").
- **`GEN/Oracle`** — text generation (`text.stream` preferred). Params: system prompt, max tokens, temperature. Outputs: `text` (streaming — downstream Caption ops render token-by-token, an intentional aesthetic), `event: complete`.
- **`GEN/Icon`** — image generation. Inputs: prompt `text`, optional init `media`. Output: `field` (texture). Includes built-in style-suffix presets aligned to the aesthetic canon ("gold-ground icon, neon rim light, mycelial gothic…"), user-editable.
- **`GEN/Antiphon`** — TTS. Input: `text`; output: `media(audio)` routed to the Audio Engine; `event: complete` for cue sequencing (e.g., advance Station when the antiphon finishes).
- **`GEN/Relief`** — image → displacement/normal map (client-side heightfield inference from luminance at v1; true depth-model support via `custom-http` later). Turns generated icons into low-relief geometry — the "carved retablo" effect.

**Determinism policy:** where providers accept seeds, seeds are recorded and replayed; where they don't, `provenance.json` marks the artifact `nondeterministic: true` and the *generated asset itself* is cached into the bundle so playback never depends on regeneration. **Published/exported experiences never call AI APIs at view time** (viewers have no keys; see §13). Live generation is an *authoring and performing* feature, not a playback dependency.

### 9.5 CORS reality & the Local Helper

Some providers reject browser-origin calls. Mitigations, in order: (1) prefer providers with browser support or permissive CORS; (2) local inference servers (Ollama et al.) are same-machine and configurable; (3) ship an **optional, single-command local helper** (`npx iconostasis-helper` or a single static binary) — a localhost reverse proxy that adds the user's key server-side-on-their-own-machine and forwards to the provider. It is open source, ~200 lines, auditable, and completely optional. The app detects it at `http://localhost:7777` and offers it as a routing option per provider. No hosted middleman exists in any configuration.

---

## 10. Subsystem: Story Engine (the Liturgy Layer)

### 10.1 Model

An **Experience** is a graph of **Stations** (default linear; branching allowed).

```
Experience
 ├─ meta (title, author, description, cover, palette-theme)
 ├─ stations: Station[]           // ordered; edges may branch
 │    ├─ id, title, subtitle
 │    ├─ patch: GraphRef          // subgraph or full-graph preset state
 │    ├─ camera: CameraCue        // position/target/fov + processional path
 │    ├─ captions: Caption[]      // timed or event-bound illuminated text
 │    ├─ cues: Cue[]              // see below
 │    ├─ audio: AudioCue[]        // beds, antiphons, stingers
 │    └─ exits: Exit[]            // {to: stationId, when: CueCondition, transition: TransitionSpec}
 └─ startStation, endStations[]
```

- **Cue conditions** (composable with and/or): `time.elapsed(s)`, `signal.threshold(port, op, value)`, `input.click(target?)`, `input.key(k)`, `gen.complete(opId)`, `audio.ended(cueId)`, `choice.selected(choiceId, option)`.
- **`LIT/Choice`** renders 2–4 interactive options (styled as illuminated manuscript marginalia or triptych panels) and emits the selection event → branching narratives. This is how "interactively construct a visual story" reaches the *viewer*, not just the author.
- **Transitions:** `crossfade`, `luma-wipe` (with shipped luma masks: rose window, gothic arch, mandorla), `bloom-through-white` (the "transfiguration cut": bloom strength ramps until the frame is light, then resolves into the next station), `hard-cut`.
- **Station patch semantics:** a Station stores a parameter-state snapshot over the project graph (+ optional per-station enabled/disabled operator set), not a wholly separate graph — keeping bundles small and authoring sane. Entering a station tweens modulatable params from current values to the snapshot over the transition duration.

### 10.2 Timeline & authoring

- A horizontal **Procession View**: stations as cards on a rail; drag to reorder; branch edges drawn as gold arcs; per-station duration/cue chips.
- Scrub-preview: dragging the playhead applies station states instantly (AI ops serve cached values while scrubbing).
- **Deterministic replay:** given a bundle + a recorded choice-path + seeds, playback is frame-stable modulo signal inputs (audio/pointer), which may be optionally recorded for full determinism (used by the video exporter, §13.2).

### 10.3 Authoring modes (progressive disclosure)

1. **Template Mode** (P2): pick a template → edit exposed params only (texts, colors, images, audio). Never sees the graph.
2. **Graph Mode** (P1): full patching.
3. **Perform Mode:** fullscreen output + mapped controls (exposed params, MIDI/keyboard bindings, station advance/retreat, panic-to-black).

Shipped v1 templates (each a complete worked example and test fixture): **Via Lucis** (linear, 7 stations), **Seraphic Meditation** (single-station, audio-reactive, the seraph asset), **The Choice at the Gate** (branching demo, 2 branches × 3 stations), **Advent Antiphons** (GEN-heavy: nightly generated antiphon + icon).

---

## 11. Subsystem: Audio & Interaction

### 11.1 Audio Engine (Web Audio API)

- Graph: sources (file bed, `GEN/Antiphon` buffers, mic input, oscillator/drone synth) → per-source gain → master bus → `AnalyserNode` → destination.
- **`SRC/AudioIn`** exposes: RMS, peak, and N-band FFT energies (default 4 bands: low/mid-low/mid-high/high, log-spaced, smoothed with configurable lag) as `signal` outputs. This is the primary reactivity source.
- Beat/onset detection: spectral-flux onset → `event` output (good-enough; no tempo tracking at v1).
- Autoplay policy: engine starts suspended; first user gesture resumes (the player UI makes this the "Enter" rite: *click to begin* — doctrine and browser policy in agreement).

### 11.2 Interaction sources

- **`SRC/Pointer`** — normalized x/y, velocity, down/up events; raycast hit test against tagged scene objects (`event: hit(objectTag)`).
- **`SRC/Keyboard`** — mappable key events.
- **`SRC/MIDI`** — WebMIDI CC/note inputs as signals/events (Chrome-class browsers; feature-detected, optional).
- **`SRC/OSC`** *(v1.1, optional)* — OSC over WebSocket for TouchDesigner/typical VJ rig interop; requires the Local Helper as the UDP↔WS bridge.
- **`SRC/Camera`** *(v1.1, optional)* — webcam luminance/motion-energy as signals (privacy: never leaves device, indicator always shown).

---

## 12. Subsystem: Persistence & File Format

### 12.1 Local-first storage tiers

1. **Working autosave:** OPFS (Origin Private File System) via a worker, debounced (≤ every 15s and on significant edits); ring buffer of the last 20 autosaves. IndexedDB fallback where OPFS is unavailable.
2. **Explicit save to disk:** File System Access API (`showSaveFilePicker`) writing a `.icx` bundle; classic download-blob fallback for browsers without FSA. Reopen via picker or drag-and-drop onto the app.
3. **Asset cache:** decoded GPU-ready assets cached in OPFS keyed by content hash.

### 12.2 The `.icx` bundle (Iconostasis eXperience)

A ZIP (store or deflate) with a stable layout:

```
myexperience.icx
├─ manifest.json        // identity, versioning, tier hints, entry points
├─ graph.json           // operators, wires, params (schema-versioned)
├─ story.json           // stations, cues, exits, captions
├─ provenance.json      // AI generation records (§12.4)
├─ theme.json           // palette tokens & typography choices
├─ assets/
│   ├─ seraph.bin
│   ├─ icon_station3.png
│   ├─ antiphon_2.ogg
│   └─ …                // referenced by content-hash filenames
└─ thumbnail.png        // 1280×720 cover
```

Rules: all JSON schemas carry `"schemaVersion"`; readers must migrate forward (migration functions per version bump, tested); unknown fields are preserved on round-trip (forward compatibility); asset references are by content hash so bundles are dedupe-able and integrity-checkable.

### 12.3 Serialization taint check (hard requirement)

Every serialization/export/publish path runs a **secret-scan gate**: reject the write if any string matches configured key patterns (`sk-…`, `sk-ant-…`, generic high-entropy detector, plus the exact strings currently in the Vault). This is defense-in-depth; keys are already architecturally excluded from Project State. A failed gate is a loud, blocking error — never a warning.

### 12.4 `provenance.json`

Append-only records: `{artifactHash, capability, providerClass, modelId, promptHash, promptText?, params, seed?, nondeterministic?, createdAt}`. `promptText` inclusion is a user toggle (default on for transparency; off for authors who consider prompts private). Published experiences carry provenance — AI-assisted art in this register should say so plainly.

---

## 13. Subsystem: Export & Standalone Player

### 13.1 Standalone Player (`player.html`)

- One self-contained HTML file: runtime (player subset — no editor code), inlined bundle (base64 or embedded zip), zero external network dependencies. Target ≤ 6 MB before assets; assets inline up to a configurable cap (default 25 MB total), beyond which the exporter emits `player.html + experience.icx` as a pair that must travel together.
- The player runs Stations, cues, choices, audio, and all rendering — but **never calls AI providers**: every GEN op plays back its cached artifact. (A "live oracle" viewer mode, where a viewer supplies their own key, is a v2 open question — §20.)
- Player chrome: title card, *click to begin* rite, progress indicia (station beads, styled as a rosary rail), mute, fullscreen, and an "About / Provenance" panel (author identity, provenance summary, license).
- Hosting is trivially static: works from `file://`, any static host, a Vercel deploy (e.g., under 40days.ai), or attached to a Nostr note as a URL.

### 13.2 Other exports

- **Video:** deterministic offline render (recorded inputs + seeds) via `MediaRecorder` at v1 (realtime capture), WebCodecs frame-accurate encode at v1.1 (non-realtime, higher quality). Vertical (9:16) and square crops with safe-area caption reflow, for social.
- **Still:** current-frame PNG at up to 4× supersample ("plate export" for prints/covers).
- **GLB:** static geometry snapshot of the current scene (point clouds included) for interop with Blender pipelines.

---

## 14. Subsystem: Publishing (Buzz, Nostr, and Ours)

### 14.1 Strategy: target the protocol Buzz stands on

Buzz is a Nostr-native workspace (chat + git for humans and agents; open source; self-hostable). Rather than integrating with a v0.x desktop app's surface, we publish to **Nostr itself**. Then:

- **In Buzz:** the experience appears as a rich note in any community/channel where it's shared — the natural "show my team/community" flow, with humans *and their agents* able to open, discuss, and even critique it.
- **In the wild:** the same signed events render in public Nostr clients (Damus, Primal, Amethyst, web clients), giving actual audience reach without us building a network.
- **In ours:** the same events, on our own relay, rendered by our own gallery (§14.4).

One publish action, three destinations, one identity.

### 14.2 Identity & signing

- The author's identity is a **Nostr keypair** (`npub`/`nsec`, secp256k1 Schnorr).
- Signing order of preference: **NIP-07** browser extension signer (Alby, nos2x, etc.) → **NIP-46** remote signer (bunker) → *last resort* local key generated in-app, stored only in the encrypted Vault, with an aggressive "back this up; we cannot recover it" ceremony. The app never asks users to paste an `nsec` from another wallet.
- The Manalive/Bitmonk maker's mark can be included as a standard profile field; experiences are signed by the author's key, full stop — authorship is cryptographic, portable, and revocation-proof by design.

### 14.3 Event model (proposed mini-NIP: "Interactive Experience")

- **Media first:** exporter uploads `thumbnail.png`, a short preview video, and (size-permitting) the `.icx` bundle and/or `player.html` to a **Blossom media server** and/or **NIP-96** HTTP file host of the user's choosing (self-hostable; multiple mirrors encouraged). Each upload yields hash-addressed URLs + **NIP-94** file-metadata events.
- **Manifest event:** one **parameterized replaceable event**, proposed `kind: 31333` (`"iconostasis-experience"`), addressable by `(pubkey, d-tag)` so updates replace cleanly:

```json
{
  "kind": 31333,
  "tags": [
    ["d", "via-lucis-2026"],
    ["title", "Via Lucis"],
    ["summary", "Seven stations of light — an interactive procession."],
    ["image", "https://blossom.example/<hash>.png"],
    ["player", "https://40days.ai/x/via-lucis/"],
    ["bundle", "https://blossom.example/<hash>.icx", "<sha256>"],
    ["t", "iconostasis"], ["t", "generative"], ["t", "sacredart"],
    ["client", "iconostasis"]
  ],
  "content": "<longer description, markdown>"
}
```

- **Announcement note:** a plain `kind: 1` note (max compatibility) with the player URL + thumbnail, `q`-tagging the 31333 event — this is what ordinary clients and Buzz channels actually render today. Optionally a **NIP-23** long-form article for authors who write commentary/meditations around the piece.
- **Zaps (NIP-57)** work automatically for authors with Lightning addresses on their profile — patronage without us building payments.
- Graceful degradation is inherent: clients that don't know kind 31333 still see the kind-1 note with a working link. Nothing depends on ecosystem adoption of our kind.

### 14.4 "Build something ourselves": the Cloister Relay

The sovereign fallback is deliberately boring: **run a standard open-source Nostr relay** (e.g., strfry/nostr-rs-relay class) + **a Blossom media server** + **a static Gallery page** (reads kind-31333 events from the relay, renders cover cards, links to players — a weekend of work, hostable on the existing Vercel setup). This is a *deployment*, not a product: zero new protocol design, and every piece is replaceable. Policy (who may post, moderation, retention) is ours because the relay is ours; identity remains the author's because keys are theirs. This is the entire "our own network" plan, and it composes with — never competes with — Buzz and public Nostr.

### 14.5 Secondary share adapters (thin, v1.1+)

- **Plain link:** copy player URL (works absolutely everywhere, including Buzz today, with zero integration).
- **AT Protocol/Bluesky:** post with link card via OAuth — an adapter behind the same `Publisher` interface, only if demand shows.
- Explicit non-goals: no Meta/X API integrations at v1; no iframe-embed SDK until the player is stable.

---

## 15. Security, Privacy & Key Handling

### 15.1 Key Vault

- **Default: session-only.** Keys live in JS memory (closure-held, not on `window`, not in `localStorage`), gone on tab close.
- **Opt-in: encrypted vault.** WebCrypto AES-256-GCM; key derived from a user passphrase via PBKDF2 (≥ 600k iterations; Argon2id via WASM if available); ciphertext in IndexedDB; auto-lock after configurable idle; passphrase never stored. Clear UI copy about the threat model (protects at-rest, not against a compromised browser/extension).
- `SecretRef` indirection: adapters receive an opaque handle; the raw string is interpolated into the outbound request only at the fetch boundary. Keys are excluded from state snapshots, undo history, error reports, and logs by construction, and §12.3's taint gate backstops all writes.

### 15.2 App integrity

- Strict CSP: `default-src 'self'`; `connect-src` allows only user-configured provider origins + configured relays/media hosts (dynamically extended with explicit user consent per origin — a visible "this app talks to:" panel); no third-party scripts, no analytics beacons at v1.
- All custom-shader compilation is inherently sandboxed to the GPU process; custom SDF/GLSL strings never reach `eval`.
- Published/exported artifacts are static content; the player contains no key input and makes no AI calls (§13.1), eliminating the largest downstream risk class.
- Telemetry: none. Crash diagnostics are local-only with an explicit "copy report" action.

### 15.3 Content responsibility & register

- User-generated prompts/outputs are the user's; the tool applies no content pipeline of its own beyond provider-side behavior. The shipped template/preset library, however, holds the reverence line (§4.5) — the sacred figures at the center of this product's universe are rendered with dignity in everything *we* ship.
- Licensing: shipped assets CC0/first-party (§5.4); bundles carry a user-chosen license field in `manifest.json` (default CC BY-NC 4.0, editable).

---

## 16. Non-Functional Requirements

1. **Performance:** frame budget per §8.4 tiers; graph cook overhead ≤ 2ms/frame at 60 ops; time-to-first-render on a template ≤ 3s on `chapel` tier; editor interactions ≤ 100ms perceived latency.
2. **Offline:** full authoring + playback offline (PWA, service-worker cached) with GEN ops in `error/last-good` state; local-model users are fully offline end-to-end.
3. **Compatibility:** evergreen Chromium/Firefox/Safari, last 2 versions; WebGPU used when present, never required; iOS Safari must reach `wayside` tier playback for published players.
4. **Photosensitivity & accessibility (doctrinal):** a flash limiter clamps whole-frame luminance oscillation to < 3 flashes/sec (WCAG 2.3.1) at the ToneMap stage — always on in the player, override only in the editor with a warning; `prefers-reduced-motion` honored (processional camera slows, particle counts drop); all captions available as an accessible text track; player chrome fully keyboard operable; UI contrast meets WCAG AA against the dark theme.
5. **Internationalization:** UI strings externalized; captions are user content (any script); fonts subset per template.
6. **Bundle sizes:** app core ≤ 1.5 MB gz (excluding optional wasm codecs, lazy-loaded); player runtime ≤ 900 KB gz.

---

## 17. Reference Stack (Suggested, Not Mandated)

Any implementer (human or agent) may substitute equivalents that satisfy the contracts above. The reference choices, with rationale:

| Concern | Reference | Acceptable substitutes |
|---|---|---|
| Language | TypeScript (strict) | Any typed language compiling to web |
| Build | Vite | esbuild, Rspack |
| 3D | Three.js (WebGPURenderer + TSL, WebGL2 fallback) | Babylon.js, custom engine meeting §8 |
| State | Zustand or nanostores + command-pattern undo | Redux, signals-based store |
| Schemas | zod (runtime) + generated JSON Schema (docs/tests) | typebox, valibot |
| Graph UI | Custom canvas/SVG editor (owned aesthetic) | React Flow as scaffold *only if* fully retheme-able |
| Workers | comlink-style RPC | raw postMessage |
| Zip | fflate | zip.js |
| Nostr | nostr-tools or NDK | custom minimal client (events are simple) |
| Storage | OPFS + idb wrapper | localForage |
| Tests | Vitest + Playwright + pixelmatch golden frames | equivalents |

Monorepo layout: `packages/engine` (graph+render+audio, UI-free, headless-testable), `packages/gen` (adapters), `packages/story`, `packages/app` (editor), `packages/player`, `packages/publish`, `packages/helper` (local CORS/OSC helper), `apps/gallery` (Cloister Relay front-end).

---

## 18. Milestones & Phasing

Each milestone is shippable and demoable. Names are liturgical; scopes are contractual.

- **M0 — Seed (1–2 wks):** render loop + 6 operators (`SRC/Time`, `SRC/AudioIn`, `SIG/LFO`, `GEO/PointCloud`, `FX/Bloom`, `OUT/Render`); seraph.bin loads and breathes with music; graph JSON round-trips. *Demo: the audio-reactive seraph, patched not coded.*
- **M1 — Instrument (3–4 wks):** full graph editor UX (§7.3), ~25 operators, Radiance Stack, device tiering, OPFS autosave, `.icx` save/load, Perform Mode v0. *Demo: compose and perform a one-station piece live.*
- **M2 — Oracle (3 wks):** Key Vault, Provider Registry, all four adapters, GEN family (`PromptLoom`, `Oracle`, `Icon`, `Antiphon`), provenance, taint gate, spend meter, Local Helper. *Demo: signals→prompt→image→texture and generated voice, live, on the user's own key — including a fully-local Ollama run.*
- **M3 — Liturgy (3–4 wks):** Story Engine, Procession View, transitions, `LIT/Choice` branching, captions, the four shipped templates, Template Mode, standalone `player.html` export, video/still export v1. *Demo: Via Lucis end-to-end, exported, opened from `file://` on a phone.*
- **M4 — Procession (2–3 wks):** Nostr publishing (NIP-07/46 signing, Blossom/NIP-96 upload, kind 31333 + kind 1 flow), publish-preview, Cloister Relay deployment (relay + gallery), verified rendering of the announcement note inside a Buzz community and two public Nostr clients. *Demo: publish once; open it in Buzz, in a public client, and in our gallery.*
- **M5 — Cathedral (ongoing/stretch):** MIDI mapping UI polish, OSC bridge, WebCodecs offline render, `GEN/Relief` depth models, AT-proto adapter, live-oracle viewer mode exploration, collaborative editing exploration.

---

## 19. Testing & Acceptance

- **Unit:** graph evaluation (cook order, dirty propagation, feedback delay, async crossfade semantics); schema round-trip with fuzzed unknown fields; migration chains v(n)→v(n+1); taint-gate red-team corpus (keys hidden in params, captions, prompt templates, asset filenames — all must block).
- **Golden-frame:** headless renders of each template at fixed seeds/inputs diffed against approved plates per tier (tolerance-based; catches shader regressions).
- **Adapter contract tests:** each adapter against a mock server implementing its wire format; `openai-compat` additionally smoke-tested against a real local Ollama in CI-optional mode.
- **Publish integration:** dockerized local relay + local Blossom server; assert event kinds/tags/signatures; assert the kind-1 note renders a working link.
- **Performance gates in CI:** cook-time budget, bundle-size budgets, template time-to-first-render.
- **Acceptance per milestone:** the italicized *Demo* line in §18 is the acceptance test, performed on `cathedral` and `wayside` class devices.

---

## 20. Risks & Open Questions

| # | Risk / question | Position |
|---|---|---|
| 1 | **Provider CORS churn** — browser-direct calls break as vendors change policy. | `openai-compat`+local models is the resilient path; Local Helper is the universal fallback; adapters are small and replaceable. |
| 2 | **Sentinel launches and overlaps.** | Expected. Hold the differentiators (§2.1): story, BYOK sovereignty, decentralized publishing, committed aesthetic. Revisit positioning at their launch. |
| 3 | **Nostr media persistence** — Blossom hosts can vanish. | Hash-addressed uploads to ≥2 mirrors by default; the bundle also lives on the author's disk; the player URL can be author-hosted (Vercel) independent of Nostr media. |
| 4 | **Buzz is v0.x and moving.** | We never bind to its app surface — only to Nostr events + plain links. Zero coupling to Buzz release cadence. |
| 5 | **WebGPU support matrix** (esp. iOS). | WebGL2 fallback is first-class, not vestigial; `wayside` tier is tested every milestone. |
| 6 | **Scope creep toward full TouchDesigner.** | Operator catalog is capped at v1; additions require removing or consolidating (one-in-one-out until v2). |
| 7 | **Kind 31333 is our invention.** | Kind-1 fallback means adoption is optional; if a community standard for interactive-media events emerges, migrate the manifest kind (replaceable events make this clean). |
| 8 | **Live-oracle viewer mode** (viewer brings a key to a published piece) — powerful, but expands the player's threat surface. | Deferred to v2; requires its own security review. |
| 9 | **Sacred-register misuse by users.** | The tool is a brush; policy lives at the relay/community layer (§14.4) and in shipped-content standards (§15.3), not in authoring restrictions. |
| 10 | **Determinism vs. provider drift** — models change under the same id. | Cached-artifact playback (§9.4) makes published works immune; authoring accepts drift as the nature of oracles. |

---

## Appendix A: Operator Catalog v1

*(35 operators. `mod` = has modulatable params; `async` = obeys §7.1 async invariant.)*

**SRC (7):** `Time` · `AudioIn` (mod) · `Pointer` · `Keyboard` · `MIDI` · `Seed` · `Constant`
**SIG (8):** `LFO` (mod) · `Envelope` (mod) · `Math` · `Smooth/Lag` (mod) · `Map/Remap` · `Logic` · `Trigger/Gate` · `Noise` (mod)
**GEN (5, all async):** `PromptLoom` · `Oracle` · `Icon` · `Antiphon` · `Relief`
**GEO (6):** `PointCloud` (async load) · `Primitive` · `Instancer` (mod) · `SDFField` (mod) · `Particles` (mod) · `Glyph` (async font)
**MAT (4):** `PointsMaterial` (mod) · `GoldLeafPBR` (mod) · `Halo` (mod) · `CustomShader` (mod)
**FX (6, all mod):** `Bloom` · `Godrays` · `ChromaticAberration` · `Grain` · `Vignette` · `Feedback` *(ToneMap lives on `OUT/Render`)*
**LIT (5):** `Station` · `Cue` · `Transition` · `Caption` · `Choice`
**OUT (4):** `Render` (owns camera + tonemap + flash limiter) · `AudioOut` · `Recorder` · `Publish`

*(Count note: SRC 7 + SIG 8 + GEN 5 + GEO 6 + MAT 4 + FX 6 + LIT 5 + OUT 4 = 45 gross; `Constant`, `Logic`, `Trigger`, `Seed`, `Cue` may merge into neighbors during implementation to land at ~35–40 net. The cap in §20.6 refers to net shipped count.)*

## Appendix B: Schemas & Example Manifest

`manifest.json` (illustrative; normative JSON Schemas live in `packages/engine/schemas/` and are generated from the runtime validators):

```json
{
  "schemaVersion": 1,
  "id": "ulid-01J…",
  "title": "Via Lucis",
  "author": { "name": "the Bitmonk", "npub": "npub1…", "mark": "a Manalive Tech project" },
  "description": "Seven stations of light — an interactive procession.",
  "license": "CC-BY-NC-4.0",
  "created": "2026-08-07T00:00:00Z",
  "modified": "2026-08-07T00:00:00Z",
  "engine": { "min": "1.0.0" },
  "tiers": { "authoredOn": "cathedral", "verified": ["chapel", "wayside"] },
  "entry": { "graph": "graph.json", "story": "story.json", "theme": "theme.json" },
  "assets": [
    { "path": "assets/seraph.bin", "sha256": "…", "type": "pointcloud/bin", "points": 288000 }
  ],
  "provenance": "provenance.json",
  "thumbnail": "thumbnail.png"
}
```

`graph.json` node instance (illustrative):

```json
{
  "id": "op_bloom1",
  "type": "FX/Bloom",
  "params": { "threshold": 0.62, "strength": 1.8, "radius": 0.85 },
  "modulations": [ { "param": "strength", "from": "op_audio1.band[0]", "map": { "in": [0,1], "out": [1.2, 3.0] } } ],
  "position": [640, 220]
}
```

## Appendix C: Glossary

- **Station** — one scene/movement of an experience; the narrative atom.
- **Shrine** — a collapsed sub-graph with promoted parameters; the remix atom.
- **Radiance Stack** — the fixed-order post-processing chain.
- **Procession View** — the timeline/sequence editor.
- **Cooking** — lazy dirty-flag graph evaluation (TouchDesigner's term, kept deliberately).
- **BYOK** — bring your own key: user-supplied AI provider credentials/subscriptions.
- **Cloister Relay** — the self-hosted Nostr relay + Blossom media server + static gallery deployment.
- **Taint gate** — the secret-scan that blocks any serialization containing key material.
- **`.icx`** — the zip-based Iconostasis eXperience bundle.
- **Perform Mode** — fullscreen output with mapped controls; the graph hidden, the instrument played.

---

*a Manalive Tech project, built by the Bitmonk*
