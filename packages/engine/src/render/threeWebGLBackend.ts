/**
 * Three.js WebGL2 render backend for OUT/Render (architecture.md §8.1–§8.3).
 * Lives in engine as the render substrate — not editor UI.
 * WebGLRenderer path (acceptance floor); WebGPU not required.
 */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import type { PointCloudGeometry } from "../assets/geometry.js";
import type { BloomPassState } from "./bloomPass.js";
import type { ChromaticAberrationPassState } from "./chromaticAberrationPass.js";
import type { GodraysPassState } from "./godraysPass.js";
import type { GrainPassState } from "./grainPass.js";
import type { DrawPointsCall, RenderBackend } from "./backend.js";
import type { ToneMapCurve } from "./toneMap.js";
import type { VignettePassState } from "./vignettePass.js";
import {
  ChromaticAberrationShader,
  GodraysShader,
  GoldLeafLiftShader,
  GrainShader,
  VignetteShader,
} from "./threeRadianceShaders.js";

const VERTEX_SHADER = /* glsl */ `
uniform float uSize;
uniform float uDisplacement;
uniform float uTime;
uniform float uExposure;
attribute vec3 color;
varying vec3 vColor;

float hash(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}

void main() {
  float n = hash(position) * 2.0 - 1.0;
  vec3 dir = length(position) > 1e-5 ? normalize(position) : vec3(0.0, 1.0, 0.0);
  float swirl = uDisplacement * 0.35 * sin(uTime * 0.7 + position.y * 3.0);
  vec3 displaced = position
    + dir * (uDisplacement * n)
    + vec3(-dir.z, 0.0, dir.x) * swirl;

  vColor = color * uExposure * 0.45;

  vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
  float atten = 2.2 / max(0.35, -mvPosition.z);
  gl_PointSize = clamp(uSize * atten, 0.5, 6.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const FRAGMENT_SHADER = /* glsl */ `
varying vec3 vColor;

void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float d = length(c);
  if (d > 0.5) discard;
  float alpha = smoothstep(0.5, 0.12, d) * 0.55;
  gl_FragColor = vec4(vColor, alpha);
}
`;

/**
 * Graph bloom strength (often 1–3) → UnrealBloomPass range (subtler).
 * UnrealBloomPass whiteouts quickly above ~1.2 on dense additive points.
 */
function mapBloomStrength(graphStrength: number): number {
  return Math.min(1.4, Math.max(0, graphStrength) * 0.22);
}

function grainModeIndex(mode: GrainPassState["mode"]): number {
  if (mode === "scanline") return 1;
  if (mode === "phosphor") return 2;
  return 0;
}

export interface ThreeWebGLBackendOptions {
  canvas: HTMLCanvasElement;
  /** Camera FOV degrees. */
  fov?: number;
  /** Camera distance along +z looking at origin. */
  cameraZ?: number;
}

export class ThreeWebGLBackend implements RenderBackend {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;
  private readonly godraysPass: ShaderPass;
  private readonly caPass: ShaderPass;
  private readonly grainPass: ShaderPass;
  private readonly vignettePass: ShaderPass;
  private readonly goldLeafPass: ShaderPass;
  private readonly clock = new THREE.Clock(false);

  private points: THREE.Points | null = null;
  private material: THREE.ShaderMaterial | null = null;
  private geometryId: PointCloudGeometry["data"] | null = null;
  private pendingBloom: BloomPassState | null = null;
  private exposure = 1;
  private time = 0;
  private disposed = false;
  private fullW = 1;
  private fullH = 1;

  constructor(opts: ThreeWebGLBackendOptions) {
    const canvas = opts.canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      opts.fov ?? 50,
      Math.max(canvas.clientWidth, 1) / Math.max(canvas.clientHeight, 1),
      0.01,
      100,
    );
    this.camera.position.set(0, 0.05, opts.cameraZ ?? 2.8);
    this.camera.lookAt(0, 0, 0);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    const size = this.renderer.getSize(new THREE.Vector2());
    this.fullW = size.x;
    this.fullH = size.y;
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(size.x, size.y),
      0.45,
      0.5,
      0.55,
    );
    this.bloomPass.enabled = true;
    this.composer.addPass(this.bloomPass);

    this.godraysPass = new ShaderPass(GodraysShader);
    this.godraysPass.enabled = false;
    this.composer.addPass(this.godraysPass);

    this.caPass = new ShaderPass(ChromaticAberrationShader);
    this.caPass.enabled = false;
    this.composer.addPass(this.caPass);

    this.grainPass = new ShaderPass(GrainShader);
    this.grainPass.enabled = false;
    this.composer.addPass(this.grainPass);

    this.vignettePass = new ShaderPass(VignetteShader);
    this.vignettePass.enabled = false;
    this.composer.addPass(this.vignettePass);

    this.goldLeafPass = new ShaderPass(GoldLeafLiftShader);
    this.goldLeafPass.enabled = false;
    this.composer.addPass(this.goldLeafPass);

    this.composer.addPass(new OutputPass());

    this.clock.start();

    window.addEventListener("resize", this.onResize);
    requestAnimationFrame(() => this.onResize());
  }

  private readonly onResize = (): void => {
    if (this.disposed) return;
    const canvas = this.renderer.domElement;
    const w = Math.max(canvas.clientWidth, 1);
    const h = Math.max(canvas.clientHeight, 1);
    this.fullW = w;
    this.fullH = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    if (!this.pendingBloom?.halfRes) {
      this.bloomPass.resolution.set(w, h);
    }
  };

  beginFrame(clearColor: string): void {
    this.time = this.clock.getElapsedTime();
    this.scene.background = new THREE.Color(clearColor);
    this.pendingBloom = null;
    this.renderer.setClearColor(new THREE.Color(clearColor), 1);
    // Default pass enables off; apply* re-enables for the frame.
    this.godraysPass.enabled = false;
    this.caPass.enabled = false;
    this.grainPass.enabled = false;
    this.vignettePass.enabled = false;
    this.goldLeafPass.enabled = false;
    this.bloomPass.enabled = false;
  }

  drawPoints(call: DrawPointsCall): void {
    this.exposure = call.exposure;
    const geom = call.geometry;
    this.ensurePoints(geom);

    if (this.material) {
      this.material.uniforms["uSize"]!.value = Math.max(
        0.8,
        geom.pointSize * 90,
      );
      this.material.uniforms["uDisplacement"]!.value = Math.max(
        0,
        geom.displacement,
      );
      this.material.uniforms["uTime"]!.value = this.time;
      this.material.uniforms["uExposure"]!.value = Math.max(0, this.exposure);
    }
  }

  applyBloom(state: BloomPassState): void {
    this.pendingBloom = state;
  }

  applyGodrays(state: GodraysPassState): void {
    this.godraysPass.enabled = state.enabled;
    this.godraysPass.uniforms["uStrength"]!.value = state.strength;
    this.godraysPass.uniforms["uDecay"]!.value = state.decay;
    this.godraysPass.uniforms["uLight"]!.value = {
      x: state.monstranceX,
      y: state.monstranceY,
    };
    this.godraysPass.uniforms["uSamples"]!.value = state.samples;
  }

  applyChromaticAberration(state: ChromaticAberrationPassState): void {
    this.caPass.enabled = state.enabled;
    this.caPass.uniforms["uAmount"]!.value = state.amount;
    this.caPass.uniforms["uEdge"]!.value = state.edgeWeight;
  }

  applyGrain(state: GrainPassState, timeSeconds: number): void {
    this.grainPass.enabled = state.enabled;
    this.grainPass.uniforms["uAmount"]!.value = state.amount;
    this.grainPass.uniforms["uTime"]!.value = timeSeconds * state.speed;
    this.grainPass.uniforms["uMode"]!.value = grainModeIndex(state.mode);
  }

  applyVignette(state: VignettePassState): void {
    this.vignettePass.enabled = state.enabled;
    this.vignettePass.uniforms["uDarkness"]!.value = state.darkness;
    this.vignettePass.uniforms["uOffset"]!.value = state.offset;
    this.vignettePass.uniforms["uGold"]!.value = state.goldTint ? 1 : 0;
  }

  applyToneMap(curve: ToneMapCurve): void {
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    if (curve === "goldLeaf") {
      this.renderer.toneMappingExposure = 1.05;
      this.goldLeafPass.enabled = true;
    } else {
      this.renderer.toneMappingExposure = 0.9;
      this.goldLeafPass.enabled = false;
    }
  }

  endFrame(): void {
    if (this.pendingBloom) {
      this.bloomPass.enabled = this.pendingBloom.enabled;
      this.bloomPass.threshold = this.pendingBloom.threshold;
      this.bloomPass.strength = mapBloomStrength(this.pendingBloom.strength);
      this.bloomPass.radius = Math.min(1.2, this.pendingBloom.radius * 0.65);
      if (this.pendingBloom.halfRes) {
        this.bloomPass.resolution.set(
          Math.max(1, Math.floor(this.fullW * 0.5)),
          Math.max(1, Math.floor(this.fullH * 0.5)),
        );
      } else {
        this.bloomPass.resolution.set(this.fullW, this.fullH);
      }
    } else {
      this.bloomPass.enabled = false;
    }
    this.composer.render();
  }

  dispose(): void {
    this.disposed = true;
    window.removeEventListener("resize", this.onResize);
    this.disposePoints();
    this.composer.dispose();
    this.renderer.dispose();
  }

  private ensurePoints(geom: PointCloudGeometry): void {
    if (this.points && this.geometryId === geom.data) {
      return;
    }
    this.disposePoints();
    this.geometryId = geom.data;

    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute(
      "position",
      new THREE.BufferAttribute(geom.data.positions, 3),
    );
    buffer.computeBoundingSphere();

    if (geom.data.colors) {
      const colors = new THREE.BufferAttribute(
        new Uint8Array(geom.data.colors),
        3,
        true,
      );
      buffer.setAttribute("color", colors);
    } else {
      const gold = new Float32Array(geom.data.count * 3);
      for (let i = 0; i < geom.data.count; i++) {
        gold[i * 3] = 1.0;
        gold[i * 3 + 1] = 0.83;
        gold[i * 3 + 2] = 0.41;
      }
      buffer.setAttribute("color", new THREE.BufferAttribute(gold, 3));
    }

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: {
        uSize: { value: 1.6 },
        uDisplacement: { value: 0 },
        uTime: { value: 0 },
        uExposure: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(buffer, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  private disposePoints(): void {
    if (this.points) {
      this.scene.remove(this.points);
      this.points.geometry.dispose();
      this.points = null;
    }
    if (this.material) {
      this.material.dispose();
      this.material = null;
    }
    this.geometryId = null;
  }
}
