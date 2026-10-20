// Intent: Pure, typed polygon-substitution machinery shared by self-similar tilings.
// Navigation: Definitions describe prototiles and child transforms; the expansion functions compose
// those transforms into deterministic leaf tiles. Audits verify that every rule covers its parent.

import { EPS_DEFAULT, type Eps } from "../../geometry/eps";

export type SubstitutionPoint = readonly [number, number];
export type SubstitutionTypeId = number & { readonly __brand: "SubstitutionTypeId" };

export interface AffineTransform {
  readonly matrix: readonly [number, number, number, number];
  readonly translation: SubstitutionPoint;
}

export interface SubstitutionPrototile {
  readonly type: SubstitutionTypeId;
  readonly vertices: readonly SubstitutionPoint[];
}

export interface SubstitutionChild {
  readonly type: SubstitutionTypeId;
  readonly transform: AffineTransform;
}

/** Unvalidated substitution inputs, accepted by diagnostic audits as well as the validator. */
export interface SubstitutionDefinitionData {
  readonly prototiles: readonly SubstitutionPrototile[];
  readonly rules: ReadonlyMap<SubstitutionTypeId, readonly SubstitutionChild[]>;
}

export type SubstitutionDefinition = SubstitutionDefinitionData & {
  readonly __brand: "ValidatedSubstitutionDefinition";
};

export interface SubstitutionSeed {
  readonly type: SubstitutionTypeId;
  readonly transform: AffineTransform;
}

export interface ExpandedSubstitutionTile {
  readonly type: SubstitutionTypeId;
  readonly transform: AffineTransform;
  readonly generation: number;
  readonly address: readonly number[];
}

/** Axis-aligned region in substitution/world coordinates used to prune an expansion. */
export interface SubstitutionWindow {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface SubstitutionRuleAreaAudit {
  readonly parentType: SubstitutionTypeId;
  readonly parentArea: number;
  readonly childrenArea: number;
  readonly error: number;
}

export interface SubstitutionRuleCoverageAudit extends SubstitutionRuleAreaAudit {
  readonly outsideVertexCount: number;
  readonly outsideArea: number;
  readonly overlapArea: number;
}

export const IDENTITY_AFFINE_TRANSFORM: AffineTransform = {
  matrix: [1, 0, 0, 1],
  translation: [0, 0],
};

export function asSubstitutionTypeId(value: number): SubstitutionTypeId {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Substitution type IDs must be non-negative integers; received ${value}.`);
  }
  return value as SubstitutionTypeId;
}

export function applyAffineTransform(
  transform: AffineTransform,
  [x, y]: SubstitutionPoint
): SubstitutionPoint {
  const [m00, m01, m10, m11] = transform.matrix;
  return [
    m00 * x + m01 * y + transform.translation[0],
    m10 * x + m11 * y + transform.translation[1],
  ];
}

export function composeAffineTransforms(
  outer: AffineTransform,
  inner: AffineTransform
): AffineTransform {
  const [a00, a01, a10, a11] = outer.matrix;
  const [b00, b01, b10, b11] = inner.matrix;
  return {
    matrix: [
      a00 * b00 + a01 * b10,
      a00 * b01 + a01 * b11,
      a10 * b00 + a11 * b10,
      a10 * b01 + a11 * b11,
    ],
    translation: applyAffineTransform(outer, inner.translation),
  };
}

export function affineDeterminant(transform: AffineTransform): number {
  const [m00, m01, m10, m11] = transform.matrix;
  return m00 * m11 - m01 * m10;
}

export function polygonSignedArea(vertices: readonly SubstitutionPoint[]): number {
  let twiceArea = 0;
  for (let index = 0; index < vertices.length; index += 1) {
    const [x1, y1] = vertices[index];
    const [x2, y2] = vertices[(index + 1) % vertices.length];
    twiceArea += x1 * y2 - y1 * x2;
  }
  return twiceArea / 2;
}

function transformPolygon(
  vertices: readonly SubstitutionPoint[],
  transform: AffineTransform
): SubstitutionPoint[] {
  return vertices.map((vertex) => applyAffineTransform(transform, vertex));
}

function cross(
  [ax, ay]: SubstitutionPoint,
  [bx, by]: SubstitutionPoint,
  [cx, cy]: SubstitutionPoint
): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

export function isConvexPolygon(
  vertices: readonly SubstitutionPoint[],
  epsilon: Eps = EPS_DEFAULT
): boolean {
  let orientation = 0;
  for (let index = 0; index < vertices.length; index += 1) {
    const turn = cross(
      vertices[index],
      vertices[(index + 1) % vertices.length],
      vertices[(index + 2) % vertices.length]
    );
    if (Math.abs(turn) <= Number(epsilon)) continue;
    const turnOrientation = Math.sign(turn);
    if (orientation !== 0 && turnOrientation !== orientation) return false;
    orientation = turnOrientation;
  }
  return orientation !== 0;
}

function transformValues(transform: AffineTransform): readonly number[] {
  return [...transform.matrix, ...transform.translation];
}

/** Validate dense IDs and the simple-polygon assumptions used by every engine operation. */
export function createSubstitutionDefinition(
  data: SubstitutionDefinitionData,
  epsilon: Eps = EPS_DEFAULT
): SubstitutionDefinition {
  if (data.prototiles.length === 0) throw new Error("A substitution needs at least one prototile.");
  if (data.rules.size !== data.prototiles.length) {
    throw new Error("Every prototile must have exactly one substitution rule.");
  }
  for (let index = 0; index < data.prototiles.length; index += 1) {
    const prototile = data.prototiles[index];
    if (prototile.type !== index) {
      throw new Error(`Prototile IDs must be dense and ordered; expected P${index}.`);
    }
    if (
      prototile.vertices.length < 3 ||
      prototile.vertices.some((vertex) => vertex.some((coordinate) => !Number.isFinite(coordinate))) ||
      Math.abs(polygonSignedArea(prototile.vertices)) <= Number(epsilon)
    ) {
      throw new Error(`Prototile P${index} must be a finite, non-degenerate polygon.`);
    }
    if (!isSimplePolygon(prototile.vertices, epsilon)) {
      throw new Error(`Prototile P${index} must be a simple polygon.`);
    }
    const children = data.rules.get(prototile.type);
    if (!children || children.length === 0) {
      throw new Error(`Missing substitution rule for prototile P${index}.`);
    }
    for (const child of children) {
      if (!data.prototiles[child.type] || data.prototiles[child.type].type !== child.type) {
        throw new Error(`Rule P${index} references unknown prototile P${child.type}.`);
      }
      if (
        transformValues(child.transform).some((value) => !Number.isFinite(value)) ||
        Math.abs(affineDeterminant(child.transform)) <= Number(epsilon)
      ) {
        throw new Error(`Rule P${index} contains a singular or non-finite child transform.`);
      }
    }
  }
  const definition: SubstitutionDefinition = {
    ...data,
    __brand: "ValidatedSubstitutionDefinition",
  };
  for (const audit of auditSubstitutionRuleCoverage(definition, epsilon)) {
    const areaTolerance =
      Number(epsilon) * Math.max(1, audit.parentArea, audit.childrenArea);
    if (
      Math.abs(audit.error) > areaTolerance ||
      audit.outsideVertexCount !== 0 ||
      audit.outsideArea > areaTolerance ||
      audit.overlapArea > areaTolerance
    ) {
      throw new Error(
        `Rule P${audit.parentType} does not tessellate its parent: ` +
          `area error ${audit.error}, outside vertices ${audit.outsideVertexCount}, ` +
          `outside area ${audit.outsideArea}, overlap area ${audit.overlapArea}.`
      );
    }
  }
  return definition;
}

function pointInsideConvexPolygon(
  point: SubstitutionPoint,
  polygon: readonly SubstitutionPoint[],
  areaTolerance: number
): boolean {
  const orientation = Math.sign(polygonSignedArea(polygon));
  return polygon.every(
    (start, index) =>
      orientation * cross(start, polygon[(index + 1) % polygon.length], point) >=
      -areaTolerance
  );
}

function pointOnSegment(
  point: SubstitutionPoint,
  start: SubstitutionPoint,
  end: SubstitutionPoint,
  epsilon: Eps
): boolean {
  if (Math.abs(cross(start, end, point)) > Number(epsilon)) return false;
  const dot =
    (point[0] - start[0]) * (point[0] - end[0]) +
    (point[1] - start[1]) * (point[1] - end[1]);
  return dot <= Number(epsilon);
}

function orientation(
  start: SubstitutionPoint,
  end: SubstitutionPoint,
  point: SubstitutionPoint,
  epsilon: Eps
): number {
  const value = cross(start, end, point);
  return Math.abs(value) <= Number(epsilon) ? 0 : Math.sign(value);
}

function segmentsIntersect(
  firstStart: SubstitutionPoint,
  firstEnd: SubstitutionPoint,
  secondStart: SubstitutionPoint,
  secondEnd: SubstitutionPoint,
  epsilon: Eps
): boolean {
  const firstStartSide = orientation(firstStart, firstEnd, secondStart, epsilon);
  const firstEndSide = orientation(firstStart, firstEnd, secondEnd, epsilon);
  const secondStartSide = orientation(secondStart, secondEnd, firstStart, epsilon);
  const secondEndSide = orientation(secondStart, secondEnd, firstEnd, epsilon);
  if (firstStartSide * firstEndSide < 0 && secondStartSide * secondEndSide < 0) return true;
  return (
    (firstStartSide === 0 && pointOnSegment(secondStart, firstStart, firstEnd, epsilon)) ||
    (firstEndSide === 0 && pointOnSegment(secondEnd, firstStart, firstEnd, epsilon)) ||
    (secondStartSide === 0 && pointOnSegment(firstStart, secondStart, secondEnd, epsilon)) ||
    (secondEndSide === 0 && pointOnSegment(firstEnd, secondStart, secondEnd, epsilon))
  );
}

function isSimplePolygon(
  vertices: readonly SubstitutionPoint[],
  epsilon: Eps
): boolean {
  for (let first = 0; first < vertices.length; first += 1) {
    const firstEnd = (first + 1) % vertices.length;
    for (let second = first + 1; second < vertices.length; second += 1) {
      const secondEnd = (second + 1) % vertices.length;
      if (first === secondEnd || second === firstEnd) continue;
      if (
        segmentsIntersect(
          vertices[first],
          vertices[firstEnd],
          vertices[second],
          vertices[secondEnd],
          epsilon
        )
      )
        return false;
    }
  }
  return true;
}

function pointInsideOrOnPolygon(
  point: SubstitutionPoint,
  polygon: readonly SubstitutionPoint[],
  epsilon: Eps
): boolean {
  for (let index = 0; index < polygon.length; index += 1) {
    if (pointOnSegment(point, polygon[index], polygon[(index + 1) % polygon.length], epsilon)) {
      return true;
    }
  }
  let inside = false;
  for (
    let index = 0, previous = polygon.length - 1;
    index < polygon.length;
    previous = index++
  ) {
    const [x, y] = polygon[index];
    const [previousX, previousY] = polygon[previous];
    if (
      (y > point[1]) !== (previousY > point[1]) &&
      point[0] < ((previousX - x) * (point[1] - y)) / (previousY - y) + x
    )
      inside = !inside;
  }
  return inside;
}

function triangulateSimplePolygon(
  vertices: readonly SubstitutionPoint[],
  areaTolerance: number
): readonly (readonly [SubstitutionPoint, SubstitutionPoint, SubstitutionPoint])[] {
  const oriented = polygonSignedArea(vertices) > 0 ? [...vertices] : [...vertices].reverse();
  const remaining = oriented.map((_, index) => index);
  const triangles: Array<readonly [SubstitutionPoint, SubstitutionPoint, SubstitutionPoint]> = [];
  while (remaining.length > 3) {
    let clipped = false;
    for (let position = 0; position < remaining.length; position += 1) {
      const previous = remaining[(position - 1 + remaining.length) % remaining.length];
      const current = remaining[position];
      const next = remaining[(position + 1) % remaining.length];
      const triangle = [oriented[previous], oriented[current], oriented[next]] as const;
      if (cross(triangle[0], triangle[1], triangle[2]) <= areaTolerance) continue;
      const containsAnotherVertex = remaining.some(
        (candidate) =>
          candidate !== previous &&
          candidate !== current &&
          candidate !== next &&
          pointInsideConvexPolygon(oriented[candidate], triangle, areaTolerance)
      );
      if (containsAnotherVertex) continue;
      triangles.push(triangle);
      remaining.splice(position, 1);
      clipped = true;
      break;
    }
    if (!clipped) throw new Error("Cannot triangulate a non-simple or numerically degenerate polygon.");
  }
  triangles.push([
    oriented[remaining[0]],
    oriented[remaining[1]],
    oriented[remaining[2]],
  ]);
  return triangles;
}

function lineIntersection(
  segmentStart: SubstitutionPoint,
  segmentEnd: SubstitutionPoint,
  clipStart: SubstitutionPoint,
  clipEnd: SubstitutionPoint,
  areaTolerance: number
): SubstitutionPoint {
  const segmentX = segmentEnd[0] - segmentStart[0];
  const segmentY = segmentEnd[1] - segmentStart[1];
  const clipX = clipEnd[0] - clipStart[0];
  const clipY = clipEnd[1] - clipStart[1];
  const denominator = segmentX * clipY - segmentY * clipX;
  if (Math.abs(denominator) <= areaTolerance) return segmentEnd;
  const offsetX = clipStart[0] - segmentStart[0];
  const offsetY = clipStart[1] - segmentStart[1];
  const amount = (offsetX * clipY - offsetY * clipX) / denominator;
  return [segmentStart[0] + amount * segmentX, segmentStart[1] + amount * segmentY];
}

function intersectConvexPolygons(
  subject: readonly SubstitutionPoint[],
  clipPolygon: readonly SubstitutionPoint[],
  areaTolerance: number
): SubstitutionPoint[] {
  const orientation = Math.sign(polygonSignedArea(clipPolygon));
  let output = [...subject];
  for (let clipIndex = 0; clipIndex < clipPolygon.length && output.length > 0; clipIndex += 1) {
    const clipStart = clipPolygon[clipIndex];
    const clipEnd = clipPolygon[(clipIndex + 1) % clipPolygon.length];
    const input = output;
    output = [];
    let segmentStart = input[input.length - 1];
    for (const segmentEnd of input) {
      const startInside =
        orientation * cross(clipStart, clipEnd, segmentStart) >= -areaTolerance;
      const endInside = orientation * cross(clipStart, clipEnd, segmentEnd) >= -areaTolerance;
      if (endInside !== startInside) {
        output.push(
          lineIntersection(segmentStart, segmentEnd, clipStart, clipEnd, areaTolerance)
        );
      }
      if (endInside) output.push(segmentEnd);
      segmentStart = segmentEnd;
    }
  }
  return output;
}

function defaultIntersectionAreaTolerance(
  first: readonly SubstitutionPoint[],
  second: readonly SubstitutionPoint[],
  coordinateEpsilon: Eps
): number {
  return (
    Number(coordinateEpsilon) *
    Math.min(polygonCharacteristicLength(first), polygonCharacteristicLength(second))
  );
}

function rawConvexPolygonIntersectionArea(
  first: readonly SubstitutionPoint[],
  second: readonly SubstitutionPoint[],
  areaTolerance: number
): number {
  const intersection = intersectConvexPolygons(first, second, areaTolerance);
  return intersection.length >= 3 ? Math.abs(polygonSignedArea(intersection)) : 0;
}

/**
 * Convex intersection with separate coordinate and derived area tolerances. Cross-product
 * predicates and the final positive-area cutoff use areaTolerance; coordinateEpsilon only derives
 * a scale-aware default when callers do not already have an area policy.
 */
export function convexPolygonIntersectionArea(
  first: readonly SubstitutionPoint[],
  second: readonly SubstitutionPoint[],
  coordinateEpsilon: Eps = EPS_DEFAULT,
  areaTolerance = defaultIntersectionAreaTolerance(first, second, coordinateEpsilon)
): number {
  const area = rawConvexPolygonIntersectionArea(first, second, areaTolerance);
  return area > areaTolerance ? area : 0;
}

/**
 * Intersection area for arbitrary simple polygons, evaluated through deterministic ear clipping.
 * The area cutoff is applied after summing triangle pairs, never independently to each pair.
 */
export function simplePolygonIntersectionArea(
  first: readonly SubstitutionPoint[],
  second: readonly SubstitutionPoint[],
  coordinateEpsilon: Eps = EPS_DEFAULT,
  areaTolerance = defaultIntersectionAreaTolerance(first, second, coordinateEpsilon)
): number {
  const firstTriangles = triangulateSimplePolygon(first, areaTolerance);
  const secondTriangles = triangulateSimplePolygon(second, areaTolerance);
  let area = 0;
  for (const firstTriangle of firstTriangles) {
    for (const secondTriangle of secondTriangles) {
      area += rawConvexPolygonIntersectionArea(firstTriangle, secondTriangle, areaTolerance);
    }
  }
  return area > areaTolerance ? area : 0;
}

export function expandSubstitution(
  definition: SubstitutionDefinition,
  seeds: readonly SubstitutionSeed[],
  steps: number
): ExpandedSubstitutionTile[] {
  validateSubstitutionSteps(steps);

  let tiles: ExpandedSubstitutionTile[] = seeds.map((seed, index) => ({
    type: seed.type,
    transform: seed.transform,
    generation: 0,
    address: [index],
  }));

  for (let generation = 1; generation <= steps; generation += 1) {
    const next: ExpandedSubstitutionTile[] = [];
    for (const tile of tiles) {
      const children = definition.rules.get(tile.type);
      if (!children) {
        throw new Error(`Missing substitution rule for prototile P${tile.type}.`);
      }
      children.forEach((child, childIndex) => {
        next.push({
          type: child.type,
          transform: composeAffineTransforms(tile.transform, child.transform),
          generation,
          address: [...tile.address, childIndex],
        });
      });
    }
    tiles = next;
  }
  return tiles;
}

function validateSubstitutionSteps(steps: number): void {
  if (!Number.isInteger(steps) || steps < 0) {
    throw new Error(`Substitution steps must be a non-negative integer; received ${steps}.`);
  }
}

function validateSubstitutionWindow(window: SubstitutionWindow): void {
  const values = [window.minX, window.minY, window.maxX, window.maxY];
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error("Substitution window bounds must be finite.");
  }
  if (window.minX >= window.maxX || window.minY >= window.maxY) {
    throw new Error("Substitution window minimum bounds must be less than its maximum bounds.");
  }
}

function pointInsideWindow(
  [x, y]: SubstitutionPoint,
  window: SubstitutionWindow,
  epsilon: Eps
): boolean {
  const tolerance = Number(epsilon);
  return (
    x >= window.minX - tolerance &&
    x <= window.maxX + tolerance &&
    y >= window.minY - tolerance &&
    y <= window.maxY + tolerance
  );
}

function substitutionWindowPolygon(
  window: SubstitutionWindow
): readonly [SubstitutionPoint, SubstitutionPoint, SubstitutionPoint, SubstitutionPoint] {
  return [
    [window.minX, window.minY],
    [window.maxX, window.minY],
    [window.maxX, window.maxY],
    [window.minX, window.maxY],
  ];
}

function polygonCharacteristicLength(polygon: readonly SubstitutionPoint[]): number {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [x, y] of polygon) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return Math.max(maxX - minX, maxY - minY);
}

function polygonOverlapsWindowArea(
  polygon: readonly SubstitutionPoint[],
  windowPolygon: ReturnType<typeof substitutionWindowPolygon>,
  epsilon: Eps
): boolean {
  const characteristicLength = Math.min(
    polygonCharacteristicLength(polygon),
    polygonCharacteristicLength(windowPolygon)
  );
  const areaTolerance = Number(epsilon) * characteristicLength;
  const intersectionArea = simplePolygonIntersectionArea(
    polygon,
    windowPolygon,
    epsilon,
    areaTolerance
  );
  return intersectionArea > areaTolerance;
}

/** Test for positive-area overlap without treating the coordinate epsilon as a fixed area cutoff. */
export function substitutionPolygonOverlapsWindow(
  polygon: readonly SubstitutionPoint[],
  window: SubstitutionWindow,
  epsilon: Eps = EPS_DEFAULT
): boolean {
  validateSubstitutionWindow(window);
  return polygonOverlapsWindowArea(polygon, substitutionWindowPolygon(window), epsilon);
}

/** Exact polygon/window intersection after a cheap axis-aligned bounds rejection. */
function polygonIntersectsWindow(
  polygon: readonly SubstitutionPoint[],
  window: SubstitutionWindow,
  corners: ReturnType<typeof substitutionWindowPolygon>,
  epsilon: Eps
): boolean {
  const tolerance = Number(epsilon);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [x, y] of polygon) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (
    maxX < window.minX - tolerance ||
    minX > window.maxX + tolerance ||
    maxY < window.minY - tolerance ||
    minY > window.maxY + tolerance
  ) {
    return false;
  }

  if (polygon.some((point) => pointInsideWindow(point, window, epsilon))) return true;

  if (corners.some((corner) => pointInsideOrOnPolygon(corner, polygon, epsilon))) return true;

  for (let polygonIndex = 0; polygonIndex < polygon.length; polygonIndex += 1) {
    const polygonStart = polygon[polygonIndex];
    const polygonEnd = polygon[(polygonIndex + 1) % polygon.length];
    for (let windowIndex = 0; windowIndex < corners.length; windowIndex += 1) {
      if (
        segmentsIntersect(
          polygonStart,
          polygonEnd,
          corners[windowIndex],
          corners[(windowIndex + 1) % corners.length],
          epsilon
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Expand only branches whose transformed parent intersects an axis-aligned window.
 * Because validated rules dissect their parent, rejected branches cannot contain a visible leaf.
 * Returned leaves have positive-area window overlap and retain the same deterministic order as a
 * full expansion followed by the equivalent overlap filter. Ancestor tangencies remain included
 * during traversal so numerical boundary contact cannot hide an overlapping descendant.
 */
export function expandSubstitutionInWindow(
  definition: SubstitutionDefinition,
  seeds: readonly SubstitutionSeed[],
  steps: number,
  window: SubstitutionWindow,
  epsilon: Eps = EPS_DEFAULT
): ExpandedSubstitutionTile[] {
  validateSubstitutionSteps(steps);
  validateSubstitutionWindow(window);

  const leaves: ExpandedSubstitutionTile[] = [];
  const windowPolygon = substitutionWindowPolygon(window);
  function visit(tile: ExpandedSubstitutionTile): void {
    const prototile = definition.prototiles[tile.type];
    if (!prototile || prototile.type !== tile.type) {
      throw new Error(`Missing canonical polygon for prototile P${tile.type}.`);
    }
    const polygon = transformPolygon(prototile.vertices, tile.transform);
    if (!polygonIntersectsWindow(polygon, window, windowPolygon, epsilon)) return;
    if (tile.generation === steps) {
      if (polygonOverlapsWindowArea(polygon, windowPolygon, epsilon)) leaves.push(tile);
      return;
    }

    const children = definition.rules.get(tile.type);
    if (!children) {
      throw new Error(`Missing substitution rule for prototile P${tile.type}.`);
    }
    children.forEach((child, childIndex) => {
      visit({
        type: child.type,
        transform: composeAffineTransforms(tile.transform, child.transform),
        generation: tile.generation + 1,
        address: [...tile.address, childIndex],
      });
    });
  }

  seeds.forEach((seed, seedIndex) => {
    visit({
      type: seed.type,
      transform: seed.transform,
      generation: 0,
      address: [seedIndex],
    });
  });
  return leaves;
}

export function materializeSubstitutionTile(
  definition: Pick<SubstitutionDefinition, "prototiles">,
  tile: ExpandedSubstitutionTile
): SubstitutionPoint[] {
  const prototile = definition.prototiles[tile.type];
  if (!prototile || prototile.type !== tile.type) {
    throw new Error(`Missing canonical polygon for prototile P${tile.type}.`);
  }
  return prototile.vertices.map((vertex) => applyAffineTransform(tile.transform, vertex));
}

export function auditSubstitutionRuleAreas(
  definition: SubstitutionDefinitionData
): SubstitutionRuleAreaAudit[] {
  return definition.prototiles.map((parent) => {
    const parentArea = Math.abs(polygonSignedArea(parent.vertices));
    const children = definition.rules.get(parent.type);
    if (!children) throw new Error(`Missing substitution rule for prototile P${parent.type}.`);
    const childrenArea = children.reduce((sum, child) => {
      const prototile = definition.prototiles[child.type];
      if (!prototile) throw new Error(`Missing canonical polygon for prototile P${child.type}.`);
      return (
        sum +
        Math.abs(affineDeterminant(child.transform)) *
          Math.abs(polygonSignedArea(prototile.vertices))
      );
    }, 0);
    return { parentType: parent.type, parentArea, childrenArea, error: childrenArea - parentArea };
  });
}

function auditSubstitutionRuleCoverageForParent(
  definition: SubstitutionDefinitionData,
  parent: SubstitutionPrototile,
  epsilon: Eps
): SubstitutionRuleCoverageAudit {
  const children = definition.rules.get(parent.type);
  if (!children) throw new Error(`Missing substitution rule for prototile P${parent.type}.`);
  const polygons = children.map((child) => {
    const prototile = definition.prototiles[child.type];
    if (!prototile) throw new Error(`Missing canonical polygon for prototile P${child.type}.`);
    return transformPolygon(prototile.vertices, child.transform);
  });
  const parentArea = Math.abs(polygonSignedArea(parent.vertices));
  const childrenArea = polygons.reduce(
    (sum, polygon) => sum + Math.abs(polygonSignedArea(polygon)),
    0
  );
  const outsideVertexCount = polygons.reduce(
    (count, polygon) =>
      count +
      polygon.filter((point) => !pointInsideOrOnPolygon(point, parent.vertices, epsilon)).length,
    0
  );
  const outsideArea = polygons.reduce((sum, polygon) => {
    const polygonArea = Math.abs(polygonSignedArea(polygon));
    return (
      sum +
      Math.max(0, polygonArea - simplePolygonIntersectionArea(polygon, parent.vertices, epsilon))
    );
  }, 0);
  let overlapArea = 0;
  for (let first = 0; first < polygons.length; first += 1) {
    for (let second = first + 1; second < polygons.length; second += 1) {
      overlapArea += simplePolygonIntersectionArea(polygons[first], polygons[second], epsilon);
    }
  }
  return {
    parentType: parent.type,
    parentArea,
    childrenArea,
    error: childrenArea - parentArea,
    outsideVertexCount,
    outsideArea,
    overlapArea,
  };
}

export function auditSubstitutionRuleCoverage(
  definition: SubstitutionDefinitionData,
  epsilon: Eps = EPS_DEFAULT
): SubstitutionRuleCoverageAudit[] {
  return definition.prototiles.map((parent) =>
    auditSubstitutionRuleCoverageForParent(definition, parent, epsilon)
  );
}
