/**
 * rAF driver — feeds host clock + audio snapshot into GraphEvaluator.tick.
 */

import type { AudioFrameSnapshot, GraphEvaluator } from "@iconostasis/engine";

export type AudioSnapshotFn = () => AudioFrameSnapshot;

export function startFrameLoop(
  evaluator: GraphEvaluator,
  getAudio: AudioSnapshotFn,
): () => void {
  let frame = 0;
  let last = performance.now();
  let raf = 0;
  let stopped = false;

  const tick = (now: number): void => {
    if (stopped) return;
    const delta = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    const time = now / 1000;

    evaluator.tick({
      time,
      delta,
      frame,
      audio: getAudio(),
    });
    frame += 1;
    raf = requestAnimationFrame(tick);
  };

  raf = requestAnimationFrame(tick);

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };
}
