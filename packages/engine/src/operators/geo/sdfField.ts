/** GEO/SDFField — raymarched SDF volume descriptor (Appendix A, §8.3). */

import type {
  OperatorFactory,
  OperatorInstance,
} from "../../types/operator.js";
import type { ParamValue } from "../../types/params.js";
import { asFinite, asString } from "../shared/paramUtils.js";

export const GEO_SDF_FIELD_TYPE = "GEO/SDFField" as const;

export interface SdfFieldGeometry {
  kind: "sdfField";
  preset: string;
  scale: number;
  soft: number;
  customSdf: string;
}

export const sdfFieldFactory: OperatorFactory = {
  type: GEO_SDF_FIELD_TYPE,
  family: "GEO",
  inputs: [],
  outputs: [{ id: "geometry", type: "geometry" }],
  params: [
    {
      id: "preset",
      type: "enum",
      default: "sphere",
      enumValues: ["sphere", "box", "torus", "mandorla", "arch"],
      modulatable: false,
      exposable: true,
    },
    {
      id: "scale",
      type: "float",
      default: 1,
      min: 0,
      modulatable: true,
      exposable: true,
    },
    {
      id: "soft",
      type: "float",
      default: 0.02,
      min: 0,
      modulatable: true,
      exposable: true,
    },
    {
      id: "customSdf",
      type: "text",
      default: "",
      modulatable: false,
      exposable: true,
    },
  ],
  create(id, params): OperatorInstance {
    let last: SdfFieldGeometry = {
      kind: "sdfField",
      preset: "sphere",
      scale: 1,
      soft: 0.02,
      customSdf: "",
    };
    const instance: OperatorInstance = {
      id,
      type: GEO_SDF_FIELD_TYPE,
      family: "GEO",
      params: { ...params },
      dirty: true,
      alwaysDirty: true,
      getOutput(port) {
        if (port !== "geometry") {
          throw new Error(`GEO/SDFField: unknown port "${port}"`);
        }
        return last;
      },
      cook(ctx) {
        last = {
          kind: "sdfField",
          preset: asString(ctx.getParam("preset"), "sphere"),
          scale: asFinite(ctx.getParam("scale"), 1),
          soft: asFinite(ctx.getParam("soft"), 0.02),
          customSdf: asString(ctx.getParam("customSdf"), ""),
        };
        ctx.setOutput("geometry", last);
      },
      dispose() {},
      serialize() {
        return { ...instance.params } as { [key: string]: ParamValue };
      },
    };
    return instance;
  },
};
