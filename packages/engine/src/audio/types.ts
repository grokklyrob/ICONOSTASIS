/**
 * Headless audio frame snapshot for SRC/AudioIn (§11.1).
 * Demo host fills this from AnalyserNode; tests inject synthetic data.
 */

/** Frequency-domain magnitude bins (e.g. AnalyserNode.getByteFrequencyData / normalized). */
export interface AudioFrameSnapshot {
  /**
   * Frequency bin magnitudes in [0, 1] (normalized).
   * Length is typically fftSize/2 (Analyser frequencyBinCount).
   */
  frequency: Float32Array | number[];
  /**
   * Optional time-domain samples in [-1, 1] for RMS/peak.
   * If omitted, RMS/peak are derived from frequency energy.
   */
  timeDomain?: Float32Array | number[];
  /** Sample rate of the AudioContext (Hz). Default 48000 when omitted. */
  sampleRate?: number;
  /** Whether audio is running (false → zeros). */
  active?: boolean;
}
