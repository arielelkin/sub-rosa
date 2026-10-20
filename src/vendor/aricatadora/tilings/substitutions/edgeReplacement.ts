// Intent: Expand exact directed edge replacements whose child patches cross straight parent edges.
// Navigation: Family constructors certify complementary boundaries. Exact leaf placements retain
// positive orientations; conservative float envelopes prune branches before final compilation.
import {
  add, multiply, multiplyByRootPower, rootPower, toComplex,
  type CyclotomicInteger, type CyclotomicRing,
} from "../../geometry/cyclotomicInteger";
import {
  type ExpandedSubstitutionTile, type SubstitutionPrototile, type SubstitutionTypeId,
  substitutionPolygonOverlapsWindow, type SubstitutionWindow,
} from "./engine";
import { EPS_DEFAULT } from "../../geometry/eps";

export interface DirectedRhomb {
  readonly type: SubstitutionTypeId;
  readonly rotation: number;
  readonly translation: CyclotomicInteger;
}

/** Generated integer schema; the family wrapper crosses into branded exact runtime values. */
export interface ExactDirectedRhombData {
  readonly type: number;
  readonly rotation: number;
  readonly translation: readonly number[];
}

export interface EdgeReplacementDefinition {
  readonly kind: "directed-edge-replacement";
  readonly ring: CyclotomicRing;
  readonly inflation: CyclotomicInteger;
  readonly exactPrototiles: readonly (readonly CyclotomicInteger[])[];
  readonly prototiles: readonly SubstitutionPrototile[];
  readonly rules: readonly (readonly DirectedRhomb[])[];
  readonly seeds: readonly DirectedRhomb[];
}

interface ExactLeaf extends DirectedRhomb {
  readonly address: readonly number[];
}

export type EdgeReplacementExtent =
  | { readonly kind: "complete-seed" }
  | { readonly kind: "window"; readonly window: SubstitutionWindow };

export type EdgeReplacementPatchExtent =
  | { readonly kind: "complete-seed" }
  | {
      readonly kind: "bounded-higher-generations";
      readonly completeThroughSteps: number;
      readonly field: {
        readonly defaultWidth: number; readonly defaultHeight: number;
        readonly minimumWidth: number; readonly maximumWidth: number;
        readonly minimumHeight: number; readonly maximumHeight: number;
        readonly dimensionStep: number;
      };
    };

interface Bounds { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number; }

/** Tight descendant bounds, including excursions beyond the straight parent rhombus. */
function descendantBounds(definition: EdgeReplacementDefinition, steps: number) {
  const inflation = toComplex(definition.inflation)[0];
  const cache = new Map<string, Bounds>();
  const bounds = (type: SubstitutionTypeId, rotation: number, remaining: number): Bounds => {
    const key = `${type}/${rotation}/${remaining}`;
    const found = cache.get(key);
    if (found) return found;
    let result: Bounds;
    if (remaining === 0) {
      const points = definition.exactPrototiles[type].map(p => toComplex(multiplyByRootPower(p, rotation)));
      result = {
        minX: Math.min(...points.map(p => p[0])), minY: Math.min(...points.map(p => p[1])),
        maxX: Math.max(...points.map(p => p[0])), maxY: Math.max(...points.map(p => p[1])),
      };
    } else {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const child of definition.rules[type]) {
        const [x, y] = toComplex(multiplyByRootPower(child.translation, rotation));
        const factor = inflation ** (remaining - 1);
        const nested = bounds(child.type, (rotation + child.rotation) % definition.ring.order, remaining - 1);
        minX = Math.min(minX, x * factor + nested.minX); minY = Math.min(minY, y * factor + nested.minY);
        maxX = Math.max(maxX, x * factor + nested.maxX); maxY = Math.max(maxY, y * factor + nested.maxY);
      }
      result = { minX, minY, maxX, maxY };
    }
    // Accumulated float bounds are for conservative rejection only; leaves remain exact.
    const padding = Number(EPS_DEFAULT) * (steps + 1) * Math.max(1,
      Math.abs(result.minX), Math.abs(result.minY), Math.abs(result.maxX), Math.abs(result.maxY));
    const padded = { minX: result.minX - padding, minY: result.minY - padding,
      maxX: result.maxX + padding, maxY: result.maxY + padding };
    cache.set(key, padded);
    return padded;
  };
  return bounds;
}

/** Expand only whole leaves overlapping the requested field, with exact final-unit translations. */
function expandInWindow(
  definition: EdgeReplacementDefinition, steps: number, window: SubstitutionWindow,
): ExactLeaf[] {
  if (![window.minX, window.minY, window.maxX, window.maxY].every(Number.isFinite) ||
    window.minX >= window.maxX || window.minY >= window.maxY) {
    throw new Error("Edge replacement window must have finite increasing bounds.");
  }
  const powers = [rootPower(definition.ring, 0)];
  for (let i = 1; i <= steps; i++) powers.push(multiply(powers[i - 1], definition.inflation));
  const bounds = descendantBounds(definition, steps);
  const leaves: ExactLeaf[] = [];
  function visit(tile: ExactLeaf, remaining: number): void {
    const [x, y] = toComplex(tile.translation);
    const b = bounds(tile.type, tile.rotation, remaining);
    const padding = Number(EPS_DEFAULT) * Math.max(1, Math.abs(x), Math.abs(y));
    if (x + b.maxX < window.minX - padding || x + b.minX > window.maxX + padding ||
      y + b.maxY < window.minY - padding || y + b.minY > window.maxY + padding) return;
    if (remaining === 0) {
      const polygon = definition.exactPrototiles[tile.type].map(p =>
        toComplex(add(tile.translation, multiplyByRootPower(p, tile.rotation))));
      if (substitutionPolygonOverlapsWindow(polygon, window)) leaves.push(tile);
      return;
    }
    definition.rules[tile.type].forEach((child, index) => visit({
      type: child.type,
      rotation: (tile.rotation + child.rotation) % definition.ring.order,
      translation: add(tile.translation,
        multiplyByRootPower(multiply(child.translation, powers[remaining - 1]), tile.rotation)),
      address: [...tile.address, index],
    }, remaining - 1));
  }
  definition.seeds.forEach((seed, index) => visit({ ...seed,
    translation: multiply(seed.translation, powers[steps]), address: [index] }, steps));
  return leaves;
}

export function expandEdgeReplacement(
  definition: EdgeReplacementDefinition,
  steps: number,
  extent: EdgeReplacementExtent = { kind: "complete-seed" },
): ExpandedSubstitutionTile[] {
  if (!Number.isInteger(steps) || steps < 0) {
    throw new Error("Edge replacement depth must be a non-negative integer.");
  }
  let leaves: ExactLeaf[] = extent.kind === "window"
    ? expandInWindow(definition, steps, extent.window)
    : definition.seeds.map((seed, index) => ({ ...seed, address: [index] }));
  for (let generation = 0; extent.kind === "complete-seed" && generation < steps; generation++) {
    leaves = leaves.flatMap(parent => definition.rules[parent.type].map((child, index) => ({
      type: child.type,
      rotation: (parent.rotation + child.rotation) % definition.ring.order,
      translation: add(
        multiply(definition.inflation, parent.translation),
        multiplyByRootPower(child.translation, parent.rotation),
      ),
      address: [...parent.address, index],
    })));
  }
  const contraction = extent.kind === "window" ? 1 : toComplex(definition.inflation)[0] ** -steps;
  return leaves.map(leaf => {
    const [x, y] = toComplex(leaf.translation);
    const [cosine, sine] = toComplex(rootPower(definition.ring, leaf.rotation));
    return {
      type: leaf.type,
      generation: steps,
      address: leaf.address,
      transform: {
        matrix: [cosine * contraction, -sine * contraction, sine * contraction, cosine * contraction],
        translation: [x * contraction, y * contraction],
      },
    };
  });
}
