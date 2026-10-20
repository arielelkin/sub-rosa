// Intent: Exact n=7 Sub Rosa prototiles, edge ownership and rose seed from Kari–Rissanen.
// Navigation: These formulas define boundaries only; Markus's recovered source owns all interiors.
// Source: https://arxiv.org/html/1512.01402v2 §§2–3.4.
import {
  add, coefficientKey, createCyclotomicRing, equals, multiplyByRootPower,
  rootPower, subtract, zero, type CyclotomicInteger,
} from "../../../geometry/cyclotomicInteger";
import { asSubstitutionTypeId } from "../engine";
import type { DirectedRhomb } from "../edgeReplacement";

export const SUB_ROSA_ORDER = 28;
export const SUB_ROSA_FOLD = 7;
const HALF_TURN = SUB_ROSA_ORDER / 2;
const ROSE_RINGS = SUB_ROSA_FOLD - 2;
export const SUB_ROSA_RING = createCyclotomicRing(SUB_ROSA_ORDER);
export type ExactRhomb = readonly CyclotomicInteger[];
const vector = (direction: number): CyclotomicInteger => rootPower(SUB_ROSA_RING, direction);
const origin = (): CyclotomicInteger => zero(SUB_ROSA_RING);

// Σ7 is the published palindromic sequence of rhombi bisected by each super-edge.
export const SUB_ROSA_SIGMA = [1, 3, 5, 1, 3, 1, 1, 3, 1, 5, 3, 1] as const;
const edgeWord = (sequence: readonly number[]): number[] => sequence.flatMap(m => [m, -m]);
const wordSum = (word: readonly number[]): CyclotomicInteger =>
  word.reduce((sum, direction) => add(sum, vector(direction)), origin());
export const SUB_ROSA_INFLATION = wordSum(edgeWord(SUB_ROSA_SIGMA));
function roseTile(ring: number, sector: number): ExactRhomb {
  let point = origin();
  for (let t = 1; t < ring; t++) point = add(point, vector(2 * (sector + t) - 1));
  const a = vector(2 * sector - 1), b = vector(2 * (sector + ring) - 1);
  return [point, add(point, a), add(add(point, a), b), add(point, b)];
}

export function subRosaRose(rings: number = ROSE_RINGS): ExactRhomb[] {
  if (!Number.isInteger(rings) || rings < 1 || rings > ROSE_RINGS) throw new Error("Invalid Sub Rosa rose ring count.");
  return Array.from({ length: rings }, (_, r) =>
    Array.from({ length: HALF_TURN }, (_, j) => roseTile(r + 1, j))).flat();
}

/** The complete CCW jagged boundary under clockwise-first-half ownership. */
export function subRosaRuleBoundary(angle: number): (readonly [CyclotomicInteger, CyclotomicInteger])[] {
  if (!Number.isInteger(angle) || angle < 1 || angle > 3) throw new Error("Invalid Sub Rosa rhomb angle.");
  const v = multiplyByRootPower(SUB_ROSA_INFLATION, 2 * angle);
  const corners = [origin(), SUB_ROSA_INFLATION, add(SUB_ROSA_INFLATION, v), v];
  const bases = [0, 2 * angle, HALF_TURN, HALF_TURN + 2 * angle];
  return corners.flatMap((corner, side) => {
    let cursor = corner;
    return SUB_ROSA_SIGMA.flatMap((m, index) => {
      const directions = index < SUB_ROSA_SIGMA.length / 2
        ? [bases[side] + m, bases[side] - m] : [bases[side] - m, bases[side] + m];
      return directions.map(direction => {
        const end = add(cursor, vector(direction));
        const edge = [cursor, end] as const; cursor = end; return edge;
      });
    });
  });
}

export function subRosaPrototiles(): ExactRhomb[] {
  return [1, 2, 3].map(k => [origin(), vector(0), add(vector(0), vector(2 * k)), vector(2 * k)]);
}

/** Recover a positive isometry by exact edge identities, retaining half-turn equivalence only. */
export function orientSubRosaRhomb(tile: ExactRhomb): DirectedRhomb {
  const candidates: DirectedRhomb[] = [];
  for (let start = 0; start < tile.length; start++) {
    const a = subtract(tile[(start + 1) % 4], tile[start]);
    const b = subtract(tile[(start + 3) % 4], tile[start]);
    for (let rotation = 0; rotation < SUB_ROSA_ORDER; rotation++) {
      if (!equals(a, vector(rotation))) continue;
      for (let k = 1; k <= 3; k++) if (equals(b, vector(rotation + 2 * k))) {
        candidates.push({ type: asSubstitutionTypeId(k - 1), rotation, translation: tile[start] });
      }
    }
  }
  if (candidates.length === 2) return candidates.sort((a, b) => a.rotation - b.rotation)[0];
  throw new Error(`Sub Rosa produced a non-unit rhombus: ${tile.map(coefficientKey).join("/")}`);
}
