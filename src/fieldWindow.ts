// Intent: Reuse Aricatadora main's source-window formulas and coverage guard with standalone point types.
// Source: aricatadora/src/tilings/substitutions/fieldWindow.ts; only imports and unit branding differ.
import { EPS_DEFAULT } from "./vendor/aricatadora/geometry/eps";
import {
  simplePolygonIntersectionArea,
  type SubstitutionPoint,
  type SubstitutionWindow,
} from "./vendor/aricatadora/tilings/substitutions/engine";

export const FIELD_OFFSET_LIMIT = 1000;
export const FIELD_OFFSET_STEP = 1;
export class SubstitutionFieldCoverageError extends Error {}

export function substitutionFieldWindow(
  width: number,
  height: number,
  offset: SubstitutionPoint,
): SubstitutionWindow {
  if (
    ![width, height, ...offset].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error(
      "Substitution field dimensions and offsets must be finite, with positive dimensions.",
    );
  }
  return {
    minX: offset[0] - width / 2,
    maxX: offset[0] + width / 2,
    minY: offset[1] - height / 2,
    maxY: offset[1] + height / 2,
  };
}

export function assertSubstitutionFieldCovered(
  polygons: readonly (readonly SubstitutionPoint[])[],
  window: SubstitutionWindow,
): void {
  const rectangle = [
    [window.minX, window.minY],
    [window.maxX, window.minY],
    [window.maxX, window.maxY],
    [window.minX, window.maxY],
  ] as const;
  const expected = (window.maxX - window.minX) * (window.maxY - window.minY);
  const actual = polygons.reduce(
    (area, polygon) => area + simplePolygonIntersectionArea(polygon, rectangle),
    0,
  );
  if (
    Math.abs(actual - expected) >
    Number(EPS_DEFAULT) * Math.max(1, expected)
  ) {
    throw new SubstitutionFieldCoverageError(
      "The requested field extends beyond this substitution generation. Reduce the field offset or size.",
    );
  }
}
