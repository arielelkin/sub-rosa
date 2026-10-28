// Intent: Adapt Aricatadora's unchanged exact Sub Rosa expansion into plain renderable polygons.
import { add, multiply, multiplyByRootPower, toComplex } from "./vendor/aricatadora/geometry/cyclotomicInteger";
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
  superRhombi: Point[][];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  sourceGeneration: SourceGeneration;
  offset: Point;
}
export type WorkerReply =
  { ok: true; patch: Patch } | { ok: false; error: string };

// Recover each visible leaf's immediate ancestor in final unit-edge coordinates.
// Straight parent guides differ from the interlocking edge-replacement boundary.
function superRhombiForAddresses(addresses: readonly (readonly number[])[], offset: Point): Point[][] {
  const parents = new Map<string, Point[]>();
  for (const address of addresses) {
    if (address.length < 2) continue;
    const prefix = address.slice(0, -1);
    const key = prefix.join("/");
    if (parents.has(key)) continue;
    let parent = SUB_ROSA.seeds[prefix[0]!]!;
    for (const index of prefix.slice(1)) {
      const child = SUB_ROSA.rules[parent.type]![index]!;
      parent = {
        type: child.type,
        rotation: (parent.rotation + child.rotation) % SUB_ROSA.ring.order,
        translation: add(multiply(SUB_ROSA.inflation, parent.translation),
          multiplyByRootPower(child.translation, parent.rotation)),
      };
    }
    parents.set(key, SUB_ROSA.exactPrototiles[parent.type]!.map((point) => {
      const [x, y] = toComplex(multiply(SUB_ROSA.inflation,
        add(parent.translation, multiplyByRootPower(point, parent.rotation))));
      return [x - offset[0], y - offset[1]] as const;
    }));
  }
  return [...parents.values()];
}

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
      superRhombi: superRhombiForAddresses(leaves.map((leaf) => leaf.address), effectiveOffset),
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
