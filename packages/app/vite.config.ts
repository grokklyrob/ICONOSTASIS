import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(rootDir, "../..");

export default defineConfig({
  root: rootDir,
  publicDir: path.join(repoRoot, "assets"),
  resolve: {
    alias: {
      "@iconostasis/engine": path.join(
        repoRoot,
        "packages/engine/src/index.ts",
      ),
    },
    dedupe: ["three"],
  },
  server: {
    fs: { allow: [repoRoot] },
  },
  optimizeDeps: {
    include: [
      "three",
      "three/addons/postprocessing/EffectComposer.js",
      "three/addons/postprocessing/RenderPass.js",
      "three/addons/postprocessing/UnrealBloomPass.js",
      "three/addons/postprocessing/OutputPass.js",
      "three/addons/postprocessing/ShaderPass.js",
      "fflate",
    ],
  },
});
