/**
 * Web Audio host for SRC/AudioIn — builds AnalyserNode snapshots.
 * Engine stays free of AudioContext construction.
 */

import type { AudioFrameSnapshot } from "@iconostasis/engine";

export class AudioHost {
  readonly context: AudioContext;
  private readonly analyser: AnalyserNode;
  private readonly master: GainNode;
  private source: AudioBufferSourceNode | null = null;
  private freq = new Float32Array(0);
  private timeDomain = new Float32Array(0);
  private started = false;

  constructor(fftSize = 2048) {
    this.context = new AudioContext();
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = fftSize;
    this.analyser.smoothingTimeConstant = 0.5;
    this.master = this.context.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(this.analyser);
    this.analyser.connect(this.context.destination);
    this.freq = new Float32Array(this.analyser.frequencyBinCount);
    this.timeDomain = new Float32Array(this.analyser.fftSize);
  }

  async resume(): Promise<void> {
    if (this.context.state === "suspended") {
      await this.context.resume();
    }
  }

  /**
   * Decode and loop an audio URL (e.g. /test-drone.ogg).
   */
  async playUrl(url: string): Promise<void> {
    await this.resume();
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Audio fetch failed: ${url} (${res.status})`);
    }
    const raw = await res.arrayBuffer();
    const buffer = await this.context.decodeAudioData(raw.slice(0));
    this.stopSource();
    const src = this.context.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(this.master);
    src.start(0);
    this.source = src;
    this.started = true;
  }

  /**
   * Play a user-picked File (optional override for the drone bed).
   */
  async playFile(file: File): Promise<void> {
    await this.resume();
    const raw = await file.arrayBuffer();
    const buffer = await this.context.decodeAudioData(raw.slice(0));
    this.stopSource();
    const src = this.context.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(this.master);
    src.start(0);
    this.source = src;
    this.started = true;
  }

  /** Snapshot for engine tick — bins normalized to [0, 1]. */
  snapshot(): AudioFrameSnapshot {
    if (!this.started || this.context.state !== "running") {
      return {
        frequency: this.freq,
        timeDomain: this.timeDomain,
        sampleRate: this.context.sampleRate,
        active: false,
      };
    }

    // Byte frequency data 0–255 → normalize.
    const byteFreq = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(byteFreq);
    for (let i = 0; i < byteFreq.length; i++) {
      this.freq[i] = (byteFreq[i] ?? 0) / 255;
    }

    this.analyser.getFloatTimeDomainData(this.timeDomain);

    return {
      frequency: this.freq,
      timeDomain: this.timeDomain,
      sampleRate: this.context.sampleRate,
      active: true,
    };
  }

  dispose(): void {
    this.stopSource();
    void this.context.close();
  }

  private stopSource(): void {
    if (this.source) {
      try {
        this.source.stop();
      } catch {
        // already stopped
      }
      this.source.disconnect();
      this.source = null;
    }
  }
}
