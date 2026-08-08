/**
 * GEO/Glyph — text as geometry (Appendix A, §8.3). Async font load scheduled.
 */

import type {
  OperatorFactory,
  OperatorInstance,
} from "../../types/operator.js";
import type { AsyncPortState } from "../../types/ports.js";
import type { ParamValue } from "../../types/params.js";
import { asFinite, asString } from "../shared/paramUtils.js";

export const GEO_GLYPH_TYPE = "GEO/Glyph" as const;

export interface GlyphGeometry {
  kind: "glyph";
  text: string;
  fontPath: string;
  size: number;
  extrude: number;
}

export const glyphFactory: OperatorFactory = {
  type: GEO_GLYPH_TYPE,
  family: "GEO",
  inputs: [{ id: "text", type: "text" }],
  outputs: [{ id: "geometry", type: "geometry" }],
  params: [
    {
      id: "text",
      type: "text",
      default: "ΑΩ",
      modulatable: false,
      exposable: true,
    },
    {
      id: "fontPath",
      type: "string",
      default: "assets/fonts/default.woff2",
      modulatable: false,
      exposable: false,
    },
    {
      id: "size",
      type: "float",
      default: 0.2,
      min: 0,
      modulatable: true,
      exposable: true,
    },
    {
      id: "extrude",
      type: "float",
      default: 0,
      min: 0,
      modulatable: true,
      exposable: true,
    },
    {
      id: "cacheScope",
      type: "enum",
      default: "station",
      enumValues: ["station", "global"],
      modulatable: false,
      exposable: false,
    },
  ],
  create(id, params): OperatorInstance {
    const asyncState: AsyncPortState<GlyphGeometry> = {
      status: "idle",
      presentation: "current",
      lastGoodValue: undefined,
    };
    let settledKey = "";
    let inflightKey = "";

    const instance: OperatorInstance = {
      id,
      type: GEO_GLYPH_TYPE,
      family: "GEO",
      params: { ...params },
      dirty: true,
      alwaysDirty: true,
      getOutput(port) {
        if (port !== "geometry") {
          throw new Error(`GEO/Glyph: unknown port "${port}"`);
        }
        return asyncState.lastGoodValue;
      },
      cook(ctx) {
        const wired = ctx.getInput("text");
        const text =
          typeof wired === "string"
            ? wired
            : asString(ctx.getParam("text"), "ΑΩ");
        const fontPath = asString(
          ctx.getParam("fontPath"),
          "assets/fonts/default.woff2",
        );
        const size = asFinite(ctx.getParam("size"), 0.2);
        const extrude = asFinite(ctx.getParam("extrude"), 0);
        const key = `${fontPath}|${text}|${size}|${extrude}`;

        if (asyncState.lastGoodValue) {
          asyncState.lastGoodValue = {
            ...asyncState.lastGoodValue,
            size,
            extrude,
          };
        }

        if (key !== settledKey && key !== inflightKey) {
          inflightKey = key;
          asyncState.status = "pending";
          // Font load: schedule if host has loadAsset; else sync placeholder.
          const loader = ctx.loadAsset;
          if (loader) {
            void loader(fontPath)
              .then(() => {
                if (inflightKey !== key) return;
                const geom: GlyphGeometry = {
                  kind: "glyph",
                  text,
                  fontPath,
                  size,
                  extrude,
                };
                asyncState.lastGoodValue = geom;
                asyncState.status = "fresh";
                asyncState.presentation = "current";
                settledKey = key;
                inflightKey = "";
                instance.dirty = true;
              })
              .catch((err: unknown) => {
                if (inflightKey !== key) return;
                asyncState.status = "error";
                asyncState.errorMessage =
                  err instanceof Error ? err.message : String(err);
                inflightKey = "";
                instance.dirty = true;
              });
          } else {
            // Headless: immediate geometry descriptor without font bytes.
            asyncState.lastGoodValue = {
              kind: "glyph",
              text,
              fontPath,
              size,
              extrude,
            };
            asyncState.status = "fresh";
            settledKey = key;
            inflightKey = "";
          }
        }

        ctx.setOutput("geometry", asyncState.lastGoodValue);
      },
      dispose() {
        asyncState.lastGoodValue = undefined;
        settledKey = "";
        inflightKey = "";
      },
      serialize() {
        return { ...instance.params } as { [key: string]: ParamValue };
      },
    };
    return instance;
  },
};
