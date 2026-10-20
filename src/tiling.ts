// Intent: Adapt Aricatadora's unchanged exact Sub Rosa expansion into plain renderable polygons.
import { toComplex } from "./vendor/aricatadora/geometry/cyclotomicInteger";
import { expandEdgeReplacement } from "./vendor/aricatadora/tilings/substitutions/edgeReplacement";
import { materializeSubstitutionTile } from "./vendor/aricatadora/tilings/substitutions/engine";
import { SUB_ROSA } from "./vendor/aricatadora/tilings/substitutions/sub-rosa/data";
import {
  assertSubstitutionFieldCovered,
  FIELD_OFFSET_LIMIT,
  SubstitutionFieldCoverageError,
  substitutionFieldWindow,
} from "./fieldWindow";

export type Point = readonly [number, number];
export type Generation = 0 | 1 | 2;
export type SourceGeneration = Generation | 3;
export interface GeometryOptions {
  generation: Generation;
  fieldSize: number;
  offset: Point;
}
export interface Tile {
  points: Point[];
  type: number;
  orientation: number;
  lineage: number;
  center: Point;
}
export interface Patch {
  tiles: Tile[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  sourceGeneration: SourceGeneration;
  offset: Point;
}
export type WorkerReply =
  { ok: true; patch: Patch } | { ok: false; error: string };

export function generatePatch({
  generation,
  fieldSize,
  offset,
}: GeometryOptions): Patch {
  if (![0, 1, 2].includes(generation) || !Number.isInteger(generation))
    throw new Error("Choose generation 0, 1, or 2.");
  if (!Number.isFinite(fieldSize) || fieldSize < 24 || fieldSize > 100)
    throw new Error("Field size must be between 24 and 100.");
  if (
    offset.length !== 2 ||
    !offset.every(
      (value) =>
        Number.isFinite(value) && Math.abs(value) <= FIELD_OFFSET_LIMIT,
    )
  )
    throw new Error(
      `Field offsets must be between -${FIELD_OFFSET_LIMIT} and ${FIELD_OFFSET_LIMIT}.`,
    );
  const effectiveOffset: Point = generation === 2 ? offset : [0, 0];
  const window = substitutionFieldWindow(fieldSize, fieldSize, effectiveOffset);
  function expand(sourceGeneration: SourceGeneration): Patch {
    const leaves = expandEdgeReplacement(
      SUB_ROSA,
      sourceGeneration,
      generation === 2 ? { kind: "window", window } : { kind: "complete-seed" },
    );
    const scale =
      generation === 2
        ? 1
        : toComplex(SUB_ROSA.inflation)[0] ** sourceGeneration;
    const polygons = leaves.map((leaf) =>
      materializeSubstitutionTile(SUB_ROSA, leaf).map(
        ([x, y]) => [x * scale, y * scale] as const,
      ),
    );
    if (generation === 2) assertSubstitutionFieldCovered(polygons, window);
    const tiles = leaves.map((leaf, i) => {
      const points = polygons[i]!.map(
        ([x, y]) => [x - effectiveOffset[0], y - effectiveOffset[1]] as const,
      );
      const [a, b] = points;
      const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
      return {
        points,
        type: Number(leaf.type),
        orientation: ((Math.round((angle * 14) / Math.PI) % 14) + 14) % 14,
        lineage: leaf.address[1] ?? leaf.address[0]!,
        center: [
          points.reduce((s, p) => s + p[0], 0) / 4,
          points.reduce((s, p) => s + p[1], 0) / 4,
        ] as const,
      };
    });
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const tile of tiles)
      for (const [x, y] of tile.points) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    return {
      tiles,
      bounds: { minX, minY, maxX, maxY },
      sourceGeneration,
      offset: effectiveOffset,
    };
  }
  try {
    return expand(generation);
  } catch (error) {
    // Match main's coverage behavior: distant fields advance to generation 3, never return a partial field.
    if (generation === 2 && error instanceof SubstitutionFieldCoverageError)
      return expand(3);
    throw error;
  }
}
