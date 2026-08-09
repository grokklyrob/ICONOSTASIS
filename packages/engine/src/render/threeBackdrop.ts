/**
 * Generated-image backdrop layer for the WebGL2 backend (§8.1, §9.4).
 *
 * A full-frame quad behind the point cloud: the generated icon is the gold
 * ground, the seraph is the figure (§5.1). Owns decode, upload, and the
 * texture crossfade that `GEN/Icon` defers to the render backend.
 *
 * The crossfade is also this path's flash guard (§16.4). `OUT/Render`'s rise-
 * rate damper works on an exposure proxy for the points; it cannot dim a
 * background texture. A swap that always takes FADE_SECONDS to complete cannot
 * strobe, so the fade is not cosmetic — do not shorten it to zero.
 */

import * as THREE from "three";
import type { GenFieldHandle } from "./backdropField.js";

/** Slow enough that a black→bright-icon swap can never read as a flash. */
const FADE_SECONDS = 1.2;

const BACKDROP_VERTEX = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  // Bypass the camera: this is a full-frame quad, not scene geometry.
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const BACKDROP_FRAGMENT = /* glsl */ `
uniform sampler2D uPrev;
uniform sampler2D uCur;
uniform float uMix;
uniform float uHasPrev;
uniform float uHasCur;
uniform float uAspectPrev;
uniform float uAspectCur;
uniform float uCanvasAspect;
uniform float uIntensity;
varying vec2 vUv;

/** Cover-fit: fill the frame, crop the overflowing axis. */
vec2 coverUv(vec2 uv, float imgAspect) {
  vec2 scale = uCanvasAspect > imgAspect
    ? vec2(1.0, imgAspect / uCanvasAspect)
    : vec2(uCanvasAspect / imgAspect, 1.0);
  return (uv - 0.5) * scale + 0.5;
}

void main() {
  vec3 prev = uHasPrev > 0.5
    ? texture2D(uPrev, coverUv(vUv, uAspectPrev)).rgb
    : vec3(0.0);
  vec3 cur = uHasCur > 0.5
    ? texture2D(uCur, coverUv(vUv, uAspectCur)).rgb
    : vec3(0.0);

  vec3 color = mix(prev, cur, clamp(uMix, 0.0, 1.0));
  gl_FragColor = vec4(color * uIntensity, 1.0);
}
`;

export interface ThreeBackdropOptions {
  /** Surfaced to the host so a blank backdrop is never silent. */
  onDiagnostic?: (message: string) => void;
}

export class ThreeBackdropLayer {
  readonly mesh: THREE.Mesh;

  private readonly onDiagnostic?: (message: string) => void;

  private readonly material: THREE.ShaderMaterial;
  private readonly geometry: THREE.PlaneGeometry;

  private current: THREE.Texture | null = null;
  private previous: THREE.Texture | null = null;
  /** Identity of the handle that is decoded or in flight — swap only on change. */
  private sourceBytes: ArrayBuffer | null = null;
  private mix = 1;
  private disposed = false;

  constructor(opts: ThreeBackdropOptions = {}) {
    this.onDiagnostic = opts.onDiagnostic;
    this.geometry = new THREE.PlaneGeometry(2, 2);
    this.material = new THREE.ShaderMaterial({
      vertexShader: BACKDROP_VERTEX,
      fragmentShader: BACKDROP_FRAGMENT,
      uniforms: {
        uPrev: { value: null },
        uCur: { value: null },
        uMix: { value: 1 },
        uHasPrev: { value: 0 },
        uHasCur: { value: 0 },
        uAspectPrev: { value: 1 },
        uAspectCur: { value: 1 },
        uCanvasAspect: { value: 1 },
        uIntensity: { value: 1 },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    // Behind everything; the points blend additively on top.
    this.mesh.renderOrder = -1000;
    this.mesh.visible = false;
  }

  /**
   * Called every frame by the backend. `undefined` fades the backdrop out and
   * releases it once it is fully gone.
   */
  setField(field: GenFieldHandle | undefined): void {
    if (this.disposed) return;

    if (field === undefined) {
      if (this.sourceBytes !== null) {
        this.sourceBytes = null;
        this.beginFadeTo(null);
      }
      return;
    }

    if (field.bytes === this.sourceBytes) return;
    this.sourceBytes = field.bytes;
    void this.decode(field);
  }

  private async decode(field: GenFieldHandle): Promise<void> {
    if (typeof createImageBitmap !== "function") {
      this.onDiagnostic?.("createImageBitmap unavailable — backdrop disabled");
      return;
    }
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(
        new Blob([field.bytes], { type: field.mime }),
      );
    } catch (err) {
      // A malformed image must not take the frame down — keep the last good
      // backdrop, exactly as the op keeps its lastGoodValue (§7.1). But say so:
      // a silently blank backdrop is indistinguishable from one that never
      // arrived, and that ambiguity has already cost a debugging session.
      this.onDiagnostic?.(
        `backdrop decode failed (${field.mime}, ${field.bytes.byteLength}B): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return;
    }
    // Raced past by a newer arrival, or disposed while decoding.
    if (this.disposed || field.bytes !== this.sourceBytes) {
      bitmap.close();
      return;
    }

    const texture = new THREE.Texture(bitmap);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    this.beginFadeTo(texture, bitmap.width / Math.max(1, bitmap.height));
    this.onDiagnostic?.(
      `backdrop texture installed (${bitmap.width}x${bitmap.height})`,
    );
  }

  private beginFadeTo(texture: THREE.Texture | null, aspect = 1): void {
    // Whatever was showing becomes the outgoing half of the crossfade.
    this.previous?.dispose();
    this.previous = this.current;
    this.material.uniforms["uPrev"]!.value = this.previous;
    this.material.uniforms["uHasPrev"]!.value = this.previous ? 1 : 0;
    this.material.uniforms["uAspectPrev"]!.value =
      this.material.uniforms["uAspectCur"]!.value;

    this.current = texture;
    this.material.uniforms["uCur"]!.value = texture;
    this.material.uniforms["uHasCur"]!.value = texture ? 1 : 0;
    this.material.uniforms["uAspectCur"]!.value = aspect;

    this.mix = 0;
    this.mesh.visible = this.previous !== null || this.current !== null;
  }

  /** Advance the crossfade. `intensity` is the limiter-scaled exposure. */
  update(deltaSeconds: number, canvasAspect: number, intensity: number): void {
    if (this.disposed) return;

    if (this.mix < 1) {
      const dt = Math.max(0, Number.isFinite(deltaSeconds) ? deltaSeconds : 0);
      this.mix = Math.min(1, this.mix + dt / FADE_SECONDS);
      if (this.mix >= 1 && this.previous) {
        this.previous.dispose();
        this.previous = null;
        this.material.uniforms["uPrev"]!.value = null;
        this.material.uniforms["uHasPrev"]!.value = 0;
        // Faded out to nothing — stop drawing the quad entirely.
        this.mesh.visible = this.current !== null;
      }
    }

    this.material.uniforms["uMix"]!.value = this.mix;
    this.material.uniforms["uCanvasAspect"]!.value =
      canvasAspect > 0 ? canvasAspect : 1;
    this.material.uniforms["uIntensity"]!.value = Math.max(0, intensity);
  }

  dispose(): void {
    this.disposed = true;
    this.mesh.visible = false;
    this.current?.dispose();
    this.previous?.dispose();
    this.current = null;
    this.previous = null;
    this.material.dispose();
    this.geometry.dispose();
  }
}
