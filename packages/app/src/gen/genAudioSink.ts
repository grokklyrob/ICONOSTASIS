/**
 * Plays GEN/Antiphon audio arrivals (§9.4 queue-to-cue, §18 M2).
 *
 * The engine stays headless: Antiphon only hands out a `gen-audio` handle and
 * decides *when* a token becomes current. Actually decoding and sounding it is
 * host work, which is why this lives in the app.
 *
 * Each handle carries a stable `token`, so presenting the same token on
 * successive frames is a no-op — playback is keyed off token identity, not off
 * the frame the handle happened to appear on.
 */

export interface GenAudioLike {
  kind: "gen-audio";
  mime: string;
  bytes: ArrayBuffer;
  text: string;
  token: string;
}

export function isGenAudioLike(v: unknown): v is GenAudioLike {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as GenAudioLike).kind === "gen-audio" &&
    typeof (v as GenAudioLike).token === "string"
  );
}

export class GenAudioSink {
  private readonly handled = new Set<string>();
  private current: AudioBufferSourceNode | null = null;
  private playingToken: string | null = null;

  private readonly gainNode: GainNode;

  constructor(
    private readonly ctx: AudioContext,
    /** Route through the analyser so a generated voice also drives visuals. */
    destination: AudioNode,
    private readonly onStatus?: (msg: string) => void,
  ) {
    this.gainNode = ctx.createGain();
    this.gainNode.connect(destination);
  }

  /** Apply the OUT/AudioOut master bus (§11.1) — gain and mute are its job. */
  setBus(gain: number, muted: boolean): void {
    const target = muted ? 0 : Math.max(0, Math.min(2, gain));
    // setTargetAtTime, not a step, so mute/unmute does not click.
    this.gainNode.gain.setTargetAtTime(target, this.ctx.currentTime, 0.015);
  }

  /** True while a generated utterance is sounding (feeds Antiphon's cue logic). */
  isPlaying(): boolean {
    return this.playingToken !== null;
  }

  /** Call each frame with Antiphon's `media` output; new tokens start playing. */
  present(value: unknown): void {
    if (!isGenAudioLike(value)) return;
    if (this.handled.has(value.token)) return;
    this.handled.add(value.token);
    void this.play(value);
  }

  private async play(handle: GenAudioLike): Promise<void> {
    try {
      // decodeAudioData detaches the buffer it is given — decode a copy so the
      // handle stays replayable and the engine's cache is not emptied.
      const decoded = await this.ctx.decodeAudioData(handle.bytes.slice(0));

      const src = this.ctx.createBufferSource();
      src.buffer = decoded;
      src.connect(this.gainNode);

      // Replacement, not overlap: a newer utterance cuts the one in flight.
      this.current?.stop();
      this.current = src;
      this.playingToken = handle.token;

      src.onended = () => {
        if (this.playingToken === handle.token) {
          this.playingToken = null;
          this.current = null;
        }
      };
      src.start();
      this.onStatus?.(
        `antiphon voiced: "${handle.text.slice(0, 48)}" (${decoded.duration.toFixed(1)}s)`,
      );
    } catch (err) {
      this.onStatus?.(
        `antiphon decode failed (${handle.mime}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  dispose(): void {
    this.current?.stop();
    this.current = null;
    this.playingToken = null;
    this.handled.clear();
  }
}
