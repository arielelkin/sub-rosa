import type { Brand } from "../branding";

export type Eps = Brand<number, "Eps">;

export const EPS_DEFAULT = 1e-9 as Eps;
export const EPS_MM_GEOMETRY = 1e-6 as Eps;
export const EPS_MM_SHARED_CUT = 1e-3 as Eps;
// Blender accepts 1e-5 m of aperture coverage rounding when mounting a GLB.
export const EPS_MM_BLENDER_APERTURE = 1e-2 as Eps;
// Direction axes are reconstructed from independently rounded polygon edges. This sine-space
// tolerance is deliberately wider than scalar EPS_DEFAULT so nearly parallel opposite edges
// remain one direction after coordinate serialization.
export const EPS_DIRECTION_ALIGNMENT_SINE = 1e-7 as Eps;
// Unit-space vertex merging is a topology policy, not a floating-point predicate. It is wider
// than EPS_DEFAULT so independently computed matching tiling vertices still share an edge key.
export const EPS_UNIT_VERTEX_MERGE = 1e-6 as Eps;

// Build a stable string key by snapping a scalar onto an epsilon-sized grid. Callers must choose an
// epsilon in the same units as the input value; the default is the generic unitless math epsilon.
export function buildEpsilonKey(value: number, epsilon: Eps = EPS_DEFAULT): string {
  return String(Math.round(value / Number(epsilon)));
}

export function buildEpsilonVectorKey(
  values: readonly number[],
  epsilon: Eps = EPS_DEFAULT
): string {
  return values.map((value) => buildEpsilonKey(value, epsilon)).join(",");
}

/** Candidate buckets which may contain a vector within epsilon in every coordinate. */
export function buildNeighboringEpsilonVectorKeys(
  values: readonly number[],
  epsilon: Eps = EPS_DEFAULT
): string[] {
  const buckets = values.map((value) => Math.round(value / Number(epsilon)));
  let keys = [""];
  for (const bucket of buckets) {
    keys = keys.flatMap((prefix) =>
      [-1, 0, 1].map((offset) => `${prefix}${prefix ? "," : ""}${bucket + offset}`)
    );
  }
  return keys;
}
