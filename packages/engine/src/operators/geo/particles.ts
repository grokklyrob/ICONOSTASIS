/**
 * GEO/Particles — GPU particle emitter request (Appendix A, §8.3–§8.4).
 * Emission count is clamped by PointGovernor when present.
 */

import type {
  OperatorFactory,
  OperatorInstance,
} from "../../types/operator.js";
import type { ParamValue } from "../../types/params.js";
import { asFinite, asString } from "../shared/paramUtils.js";

export const GEO_PARTICLES_TYPE = "GEO/Particles" as const;

export interface ParticlesGeometry {
  kind: "particles";
  count: number;
  granted: number;
  shape: string;
  lifetime: number;
  speed: number;
}

export const particlesFactory: OperatorFactory = {
  type: GEO_PARTICLES_TYPE,
  family: "GEO",
  inputs: [{ id: "geometry", type: "geometry", label: "emit from surface" }],
  outputs: [{ id: "geometry", type: "geometry" }],
  params: [
    {
      id: "count",
      type: "int",
      default: 1000,
      min: 0,
      max: 2_000_000,
      modulatable: true,
      exposable: true,
    },
    {
      id: "shape",
      type: "enum",
      default: "point",
      enumValues: ["point", "sphere", "fromGeometry"],
      modulatable: false,
      exposable: true,
    },
    {
      id: "lifetime",
      type: "float",
      default: 2,
      min: 0,
      modulatable: true,
      exposable: true,
    },
    {
      id: "speed",
      type: "float",
      default: 0.5,
      min: 0,
      modulatable: true,
      exposable: true,
    },
  ],
  create(id, params): OperatorInstance {
    let last: ParticlesGeometry = {
      kind: "particles",
      count: 0,
      granted: 0,
      shape: "point",
      lifetime: 2,
      speed: 0.5,
    };
    const instance: OperatorInstance = {
      id,
      type: GEO_PARTICLES_TYPE,
      family: "GEO",
      params: { ...params },
      dirty: true,
      alwaysDirty: true,
      getOutput(port) {
        if (port !== "geometry") {
          throw new Error(`GEO/Particles: unknown port "${port}"`);
        }
        return last;
      },
      cook(ctx) {
        const requested = Math.max(
          0,
          Math.floor(asFinite(ctx.getParam("count"), 1000)),
        );
        const granted = ctx.pointGovernor
          ? ctx.pointGovernor.request(id, requested)
          : requested;
        last = {
          kind: "particles",
          count: requested,
          granted,
          shape: asString(ctx.getParam("shape"), "point"),
          lifetime: asFinite(ctx.getParam("lifetime"), 2),
          speed: asFinite(ctx.getParam("speed"), 0.5),
        };
        // Surface emit source available via getInput when shape is fromGeometry.
        void ctx.getInput("geometry");
        ctx.setOutput("geometry", last);
      },
      dispose() {
        // Governor lease released when host disposes with a shared governor;
        // request(0) path is per cook — no retained governor ref here.
      },
      serialize() {
        return { ...instance.params } as { [key: string]: ParamValue };
      },
    };
    return instance;
  },
};
