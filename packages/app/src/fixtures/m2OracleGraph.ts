/**
 * M2 demo graph — the whole §18 M2 demo line in one document:
 * signals→PromptLoom→Oracle→{Caption, Antiphon (voice), Icon (texture)}.
 * Text goes to the first text-capable provider via an empty providerInstanceId
 * — the OpenRouter BYOK default (§18/AMD-30), which needs a key bound in the
 * Providers panel. With no key, point oracle1 at `local-mock` to drive the
 * graph for free. Speech and image always use the Local Helper mock.
 *
 * Bump Oracle `fire` (Perform slider or Fire Oracle) to invoke. Oracle's
 * `complete` then triggers both Antiphon and Icon: the antiphon audio reaches
 * OUT/AudioOut (the master bus the host reads to sound it) and the icon reaches
 * OUT/Render's `backdrop` (the texture the WebGL backend crossfades in).
 *
 * Every GEN op here terminates in an OUT sink on purpose. `evaluator.tick`
 * pull-evaluates from `family === "OUT"` only, so a GEN op with no sink
 * downstream is never invoked at all — it does not silently no-op, it simply
 * never cooks. LIT/Caption is family LIT, so the caption tail is not a sink;
 * Oracle is reachable because of the Antiphon and Icon chains, not the caption.
 */

import type { GraphDocument } from "@iconostasis/engine";

export const m2OracleGraph: GraphDocument = {
  schemaVersion: 1,
  nodes: [
    {
      id: "time1",
      type: "SRC/Time",
      params: { speed: 1 },
      position: [40, 40],
    },
    {
      id: "audio1",
      type: "SRC/AudioIn",
      params: { smoothing: 0.65, fftSize: 2048 },
      position: [40, 180],
    },
    {
      id: "lfo1",
      type: "SIG/LFO",
      params: {
        waveform: "sine",
        frequency: 0.08,
        amp: 0.006,
        offset: 0.018,
        phase: 0,
      },
      position: [40, 340],
    },
    {
      id: "loom1",
      type: "GEN/PromptLoom",
      params: {
        template:
          "Ambient light is {{lux}}. Band energy {{band}}. Write one short vesper antiphon line (under 12 words).",
      },
      position: [280, 200],
    },
    {
      id: "oracle1",
      type: "GEN/Oracle",
      params: {
        providerInstanceId: "",
        system: "You are a laconic liturgical poet. Reply with only the antiphon line.",
        maxTokens: 48,
        temperature: 0.7,
        seed: 0,
        model: "",
        triggerMode: "manual",
        fire: 0,
        threshold: 0.5,
        minIntervalMs: 2500,
        cacheScope: "station",
        stationId: "default",
        stream: true,
      },
      position: [520, 200],
    },
    {
      id: "caption1",
      type: "LIT/Caption",
      params: {
        captionId: "antiphon",
        text: "",
        visible: true,
      },
      position: [760, 120],
    },
    {
      id: "antiphon1",
      type: "GEN/Antiphon",
      params: {
        // Explicit: empty would resolve to the first speech-capable provider,
        // which is the cloud text provider (openai-compat claims the cap on any
        // baseUrl) and would fail against an endpoint that serves no speech.
        providerInstanceId: "local-mock",
        model: "tts-1",
        maxTokens: 0,
        temperature: 0,
        seed: 0,
        triggerMode: "event",
        fire: 0,
        threshold: 0.5,
        minIntervalMs: 3000,
        cacheScope: "station",
        stationId: "default",
        audioPlaying: false,
      },
      position: [760, 380],
    },
    {
      // The written line becomes the image prompt — this is the "signals→
      // prompt→image" leg, with Oracle's text as the middle term.
      id: "loom2",
      type: "GEN/PromptLoom",
      params: {
        template: "{{text}} — a single icon panel of that line.",
      },
      position: [520, -100],
    },
    {
      id: "icon1",
      type: "GEN/Icon",
      params: {
        // Explicit for the same reason as antiphon1: empty resolves to the
        // first image-capable provider, which serves no images.
        providerInstanceId: "local-mock",
        model: "mock-icon-1",
        maxTokens: 0,
        temperature: 0,
        seed: 0,
        triggerMode: "event",
        fire: 0,
        threshold: 0.5,
        // Slower than Antiphon: an image swap is the heavier visual event.
        minIntervalMs: 6000,
        cacheScope: "station",
        stationId: "default",
        stylePreset: "gold-ground",
        styleSuffix: "",
      },
      position: [760, -100],
    },
    {
      id: "audioout1",
      type: "OUT/AudioOut",
      params: { gain: 1, muted: false },
      position: [1000, 380],
    },
    {
      id: "pc1",
      type: "GEO/PointCloud",
      params: {
        assetPath: "assets/seraph.bin",
        maxPoints: 288000,
        pointSize: 0.016,
        displacement: 0,
        displacementScale: 1,
        cacheScope: "station",
      },
      position: [520, 40],
    },
    {
      id: "bloom1",
      type: "FX/Bloom",
      params: {
        threshold: 0.72,
        strength: 1.4,
        radius: 0.7,
        enabled: true,
      },
      position: [760, 280],
    },
    {
      id: "out1",
      type: "OUT/Render",
      params: {
        fov: 50,
        exposure: 1,
        clearColor: "#0d0d14",
      },
      position: [1000, 180],
    },
  ],
  wires: [
    {
      id: "w_audio_lux",
      from: { opId: "audio1", port: "bandLow" },
      to: { opId: "loom1", port: "lux" },
    },
    {
      id: "w_audio_band",
      from: { opId: "audio1", port: "rms" },
      to: { opId: "loom1", port: "band" },
    },
    {
      id: "w_loom_oracle",
      from: { opId: "loom1", port: "text" },
      to: { opId: "oracle1", port: "prompt" },
    },
    {
      id: "w_oracle_caption",
      from: { opId: "oracle1", port: "text" },
      to: { opId: "caption1", port: "text" },
    },
    {
      id: "w_oracle_antiphon_text",
      from: { opId: "oracle1", port: "text" },
      to: { opId: "antiphon1", port: "text" },
    },
    {
      // Oracle's completion is the trigger — speak the line once it has landed,
      // not on every streaming delta.
      id: "w_oracle_antiphon_event",
      from: { opId: "oracle1", port: "complete" },
      to: { opId: "antiphon1", port: "event" },
    },
    {
      id: "w_antiphon_bus",
      from: { opId: "antiphon1", port: "media" },
      to: { opId: "audioout1", port: "media" },
    },
    {
      id: "w_oracle_loom2",
      from: { opId: "oracle1", port: "text" },
      to: { opId: "loom2", port: "text" },
    },
    {
      id: "w_loom2_icon",
      from: { opId: "loom2", port: "text" },
      to: { opId: "icon1", port: "prompt" },
    },
    {
      // Same edge as Antiphon: draw the finished line, not each streaming delta.
      id: "w_oracle_icon_event",
      from: { opId: "oracle1", port: "complete" },
      to: { opId: "icon1", port: "event" },
    },
    {
      id: "w_icon_backdrop",
      from: { opId: "icon1", port: "field" },
      to: { opId: "out1", port: "backdrop" },
    },
    {
      id: "w_pc_geom",
      from: { opId: "pc1", port: "geometry" },
      to: { opId: "out1", port: "geometry" },
    },
    {
      id: "w_bloom_field",
      from: { opId: "bloom1", port: "field" },
      to: { opId: "out1", port: "bloom" },
    },
  ],
  modulations: [
    {
      id: "m_band_disp",
      from: { opId: "audio1", port: "bandLow" },
      to: { opId: "pc1", param: "displacement" },
      map: { in: [0, 1], out: [0, 0.15] },
    },
    {
      id: "m_band_bloom",
      from: { opId: "audio1", port: "bandHigh" },
      to: { opId: "bloom1", param: "strength" },
      map: { in: [0, 1], out: [1.0, 2.2] },
    },
    {
      id: "m_lfo_size",
      from: { opId: "lfo1", port: "out" },
      to: { opId: "pc1", param: "pointSize" },
      map: { in: [0.012, 0.024], out: [0.012, 0.024] },
    },
  ],
};

/** Bump GEN/Oracle fire tokens on a document (returns new doc). */
export function bumpOracleFire(
  doc: GraphDocument,
  oracleId = "oracle1",
): GraphDocument {
  const nodes = doc.nodes.map((n) => {
    if (n.id !== oracleId) return n;
    const prev = Number(n.params.fire ?? 0);
    return {
      ...n,
      params: {
        ...n.params,
        fire: Math.floor(prev) + 1,
      },
    };
  });
  return { ...doc, nodes };
}
