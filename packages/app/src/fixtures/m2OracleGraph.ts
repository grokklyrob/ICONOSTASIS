/**
 * M2 demo graph — seraph visual + signals→PromptLoom→Oracle→Caption→Antiphon
 * (§18 M2). Local Ollama for text via empty providerInstanceId (first
 * text-capable provider); the Local Helper mock for speech.
 *
 * Bump Oracle `fire` (Perform slider or Fire Oracle) to invoke. Oracle's
 * `complete` then triggers Antiphon, whose audio reaches OUT/AudioOut — the
 * master bus the host reads to sound it.
 *
 * GEN/Icon is deliberately absent: its `field` output has no consumer in the
 * render path yet (OUT/Render's field inputs are all post-FX slots), and an
 * unwired GEN op is never pulled by a sink, so it would never even cook.
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
        // which is local-ollama (openai-compat claims the cap) and would fail.
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
