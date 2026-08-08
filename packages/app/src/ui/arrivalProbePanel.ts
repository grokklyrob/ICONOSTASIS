/**
 * Arrival Law probe panel — M1 exit demo surface (§18).
 */

import type { ArrivalProbeHost, SyntheticMode } from "../probe/arrivalProbe.js";

const MODES: SyntheticMode[] = [
  "signal",
  "text-stream",
  "text-replace",
  "audio",
  "field",
  "geometry",
  "fail",
];

export function mountArrivalProbePanel(
  root: HTMLElement,
  probe: ArrivalProbeHost,
): void {
  root.innerHTML = `
    <h2 class="probe-title">Arrival probe</h2>
    <p class="muted probe-blurb">
      TEST/SyntheticAsync — policies under fake latency (§7.1 / §18 M1)
    </p>
    <label>mode
      <select id="probe-mode"></select>
    </label>
    <label>latency ms
      <input id="probe-latency" type="number" min="0" step="50" value="250" />
    </label>
    <label>cacheScope
      <select id="probe-scope">
        <option value="station">station</option>
        <option value="global">global</option>
      </select>
    </label>
    <label class="probe-check">
      <input id="probe-playing" type="checkbox" /> audio playing
    </label>
    <div class="probe-actions">
      <button type="button" id="probe-fire">Fire generation</button>
      <button type="button" id="probe-cue">Audio cue</button>
    </div>
    <dl id="probe-readout" class="probe-readout"></dl>
  `;

  const modeSel = root.querySelector<HTMLSelectElement>("#probe-mode")!;
  for (const m of MODES) {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    modeSel.appendChild(opt);
  }

  const latency = root.querySelector<HTMLInputElement>("#probe-latency")!;
  const scope = root.querySelector<HTMLSelectElement>("#probe-scope")!;
  const playing = root.querySelector<HTMLInputElement>("#probe-playing")!;
  const fire = root.querySelector<HTMLButtonElement>("#probe-fire")!;
  const cue = root.querySelector<HTMLButtonElement>("#probe-cue")!;
  const readout = root.querySelector<HTMLElement>("#probe-readout")!;

  modeSel.addEventListener("change", () => {
    probe.setMode(modeSel.value as SyntheticMode);
  });
  latency.addEventListener("change", () => {
    probe.setLatencyMs(Number(latency.value) || 0);
  });
  scope.addEventListener("change", () => {
    probe.setCacheScope(scope.value === "global" ? "global" : "station");
  });
  playing.addEventListener("change", () => {
    probe.setAudioPlaying(playing.checked);
  });
  fire.addEventListener("click", () => probe.fire());
  cue.addEventListener("click", () => probe.cueAudio());

  const render = (): void => {
    const p = probe.getParams();
    const v = probe.getView();
    modeSel.value = String(p.mode ?? "signal");
    latency.value = String(p.latencyMs ?? 250);
    scope.value = String(p.cacheScope ?? "station");
    playing.checked = Boolean(p.audioPlaying);

    const presented =
      typeof v.presented === "object" && v.presented !== null
        ? JSON.stringify(v.presented)
        : String(v.presented ?? "—");

    readout.innerHTML = `
      <div><dt>status</dt><dd class="st-${v.status}">${v.status}</dd></div>
      <div><dt>presentation</dt><dd>${v.presentation}</dd></div>
      <div><dt>generation</dt><dd>${v.settledGeneration ?? "—"} / ${String(p.generation)}</dd></div>
      <div><dt>presented</dt><dd class="mono">${escapeHtml(presented)}</dd></div>
      <div><dt>lastGood</dt><dd class="mono">${escapeHtml(fmt(v.lastGoodValue))}</dd></div>
      <div><dt>audioQueued</dt><dd>${v.audioQueued ?? "—"}</dd></div>
      <div><dt>gpuFade</dt><dd>${v.gpuFadeActive ? "active" : "—"}</dd></div>
      <div><dt>cacheKey</dt><dd class="mono small">${escapeHtml(v.cacheKey ?? "—")}</dd></div>
      <div><dt>error</dt><dd class="err">${escapeHtml(v.errorMessage ?? "—")}</dd></div>
    `;
  };

  probe.subscribe(render);
  render();
  probe.start();
}

function fmt(v: unknown): string {
  if (v === undefined) return "—";
  if (typeof v === "object" && v !== null) return JSON.stringify(v);
  return String(v);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
