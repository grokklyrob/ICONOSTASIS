/**
 * MAT/CustomShader — escape-hatch GLSL string material (Appendix A).
 * Shader text is author content; never secrets. Compile is backend concern.
 */

import type { MaterialHandle } from "../../materials/types.js";
import type {
  OperatorFactory,
  OperatorInstance,
} from "../../types/operator.js";
import type { ParamValue } from "../../types/params.js";
import { asFinite, asString } from "../shared/paramUtils.js";

export const MAT_CUSTOM_SHADER_TYPE = "MAT/CustomShader" as const;

export const customShaderFactory: OperatorFactory = {
  type: MAT_CUSTOM_SHADER_TYPE,
  family: "MAT",
  inputs: [],
  outputs: [{ id: "material", type: "material" }],
  params: [
    {
      id: "fragment",
      type: "text",
      default: "",
      modulatable: false,
      exposable: true,
    },
    {
      id: "vertex",
      type: "text",
      default: "",
      modulatable: false,
      exposable: false,
    },
    {
      id: "u0",
      type: "float",
      default: 0,
      modulatable: true,
      exposable: true,
    },
  ],
  create(id, params): OperatorInstance {
    let last: MaterialHandle = {
      kind: "material",
      materialKind: "customShader",
      params: {},
    };
    const instance: OperatorInstance = {
      id,
      type: MAT_CUSTOM_SHADER_TYPE,
      family: "MAT",
      params: { ...params },
      dirty: true,
      alwaysDirty: true,
      getOutput(port) {
        if (port !== "material") {
          throw new Error(`MAT/CustomShader: unknown port "${port}"`);
        }
        return last;
      },
      cook(ctx) {
        last = {
          kind: "material",
          materialKind: "customShader",
          params: {
            fragment: asString(ctx.getParam("fragment"), ""),
            vertex: asString(ctx.getParam("vertex"), ""),
            u0: asFinite(ctx.getParam("u0"), 0),
          },
        };
        ctx.setOutput("material", last);
      },
      dispose() {},
      serialize() {
        return { ...instance.params } as { [key: string]: ParamValue };
      },
    };
    return instance;
  },
};
