/**
 * Lightweight GLSL for Radiance Stack post passes (WebGL2 floor, §8.2).
 * Used by ThreeWebGLBackend via ShaderPass — not editor UI.
 */

import type { IUniform } from "three";

export const GodraysShader = {
  name: "GodraysShader",
  uniforms: {
    tDiffuse: { value: null },
    uStrength: { value: 0.45 },
    uDecay: { value: 0.92 },
    uLight: { value: { x: 0.5, y: 0.55 } },
    uSamples: { value: 32 },
  } as Record<string, IUniform>,
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uStrength;
    uniform float uDecay;
    uniform vec2 uLight;
    uniform float uSamples;
    varying vec2 vUv;

    void main() {
      vec2 delta = (uLight - vUv) / max(uSamples, 1.0);
      vec2 uv = vUv;
      vec4 color = texture2D(tDiffuse, uv);
      float illum = 1.0;
      vec3 acc = color.rgb;
      for (int i = 0; i < 64; i++) {
        if (float(i) >= uSamples) break;
        uv += delta;
        illum *= uDecay;
        acc += texture2D(tDiffuse, uv).rgb * illum;
      }
      vec3 shafts = acc / max(uSamples * 0.35, 1.0);
      gl_FragColor = vec4(mix(color.rgb, shafts, clamp(uStrength, 0.0, 1.0)), color.a);
    }
  `,
};

export const ChromaticAberrationShader = {
  name: "ChromaticAberrationShader",
  uniforms: {
    tDiffuse: { value: null },
    uAmount: { value: 0.003 },
    uEdge: { value: 0.85 },
  } as Record<string, IUniform>,
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uAmount;
    uniform float uEdge;
    varying vec2 vUv;

    void main() {
      vec2 c = vUv - 0.5;
      float r = length(c);
      float w = mix(1.0, r * 2.0, clamp(uEdge, 0.0, 1.0));
      vec2 dir = length(c) > 1e-5 ? normalize(c) : vec2(0.0);
      vec2 o = dir * uAmount * w;
      float cr = texture2D(tDiffuse, vUv + o).r;
      float cg = texture2D(tDiffuse, vUv).g;
      float cb = texture2D(tDiffuse, vUv - o).b;
      float a = texture2D(tDiffuse, vUv).a;
      gl_FragColor = vec4(cr, cg, cb, a);
    }
  `,
};

export const GrainShader = {
  name: "GrainShader",
  uniforms: {
    tDiffuse: { value: null },
    uAmount: { value: 0.08 },
    uTime: { value: 0 },
    uMode: { value: 0 }, // 0 film, 1 scanline, 2 phosphor
  } as Record<string, IUniform>,
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uAmount;
    uniform float uTime;
    uniform float uMode;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float n = hash(vUv * vec2(1920.0, 1080.0) + uTime * 60.0);
      float grain = (n - 0.5) * uAmount * 2.0;
      vec3 rgb = color.rgb + grain;
      if (uMode > 0.5 && uMode < 1.5) {
        // scanline
        float line = step(0.5, fract(vUv.y * 540.0));
        rgb *= mix(1.0, 0.85, line * uAmount * 4.0);
      } else if (uMode > 1.5) {
        // phosphor green lean
        rgb = mix(rgb, rgb * vec3(0.85, 1.05, 0.9), uAmount * 2.0);
        rgb += grain * 0.5;
      }
      gl_FragColor = vec4(rgb, color.a);
    }
  `,
};

export const VignetteShader = {
  name: "VignetteShader",
  uniforms: {
    tDiffuse: { value: null },
    uDarkness: { value: 0.55 },
    uOffset: { value: 0.35 },
    uGold: { value: 1 },
  } as Record<string, IUniform>,
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uDarkness;
    uniform float uOffset;
    uniform float uGold;
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec2 c = vUv - 0.5;
      float d = length(c) * 1.41421356;
      float vig = smoothstep(uOffset, 1.0, d);
      vec3 edge = mix(vec3(0.0), vec3(0.12, 0.08, 0.02), clamp(uGold, 0.0, 1.0));
      vec3 rgb = mix(color.rgb, edge, vig * uDarkness);
      gl_FragColor = vec4(rgb, color.a);
    }
  `,
};

export const GoldLeafLiftShader = {
  name: "GoldLeafLiftShader",
  uniforms: {
    tDiffuse: { value: null },
  } as Record<string, IUniform>,
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;

    // Lifted warm highlights — Gold Leaf curve approximation (§8.2).
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec3 rgb = color.rgb;
      float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
      float lift = smoothstep(0.45, 1.0, luma) * 0.12;
      rgb += vec3(lift * 1.1, lift * 0.85, lift * 0.35);
      gl_FragColor = vec4(rgb, color.a);
    }
  `,
};
