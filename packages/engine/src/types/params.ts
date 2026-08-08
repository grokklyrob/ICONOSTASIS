/**
 * Parameter specs (architecture.md §7.2).
 */

export type ParamType =
  | "float"
  | "int"
  | "bool"
  | "enum"
  | "color"
  | "string"
  | "text"
  | "curve"
  | "seed";

export type ParamValue = number | boolean | string;

export interface ParamSpec {
  id: string;
  type: ParamType;
  default: ParamValue;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  enumValues?: readonly string[];
  /** Whether the param can surface in Perform Mode / templates. */
  exposable: boolean;
  /** Whether a signal wire can drive this param (modulation edge). */
  modulatable: boolean;
}
