// Intent: Compile Markus Rissanen's recovered n7.3 interiors without constructing substitute fills.
// Navigation: The pinned artifact owns placements; construction.ts owns boundary and seed formulas.
import { add, fromCoefficients, multiplyByRootPower, toComplex } from '../../../geometry/cyclotomicInteger';
import { SUB_ROSA_RECOVERED } from '../../../data/substitutions/sub-rosa.recovered';
import { asSubstitutionTypeId } from '../engine';
import type { EdgeReplacementDefinition } from '../edgeReplacement';
import {
  orientSubRosaRhomb, subRosaPrototiles, subRosaRose,
  SUB_ROSA_RING, SUB_ROSA_INFLATION, type ExactRhomb,
} from './construction';

const exactPrototiles = subRosaPrototiles();
export const SUB_ROSA: EdgeReplacementDefinition = {
  kind: 'directed-edge-replacement', ring: SUB_ROSA_RING, inflation: SUB_ROSA_INFLATION,
  exactPrototiles,
  prototiles: exactPrototiles.map((vertices, index) => ({ type: asSubstitutionTypeId(index), vertices: vertices.map(toComplex) })),
  rules: SUB_ROSA_RECOVERED.rules.map(rule => rule.map(child => ({
    type: asSubstitutionTypeId(child.type), rotation: child.rotation,
    translation: fromCoefficients(SUB_ROSA_RING, child.translation),
  }))),
  seeds: subRosaRose(1).map(orientSubRosaRhomb),
};

export function subRosaRulePolygons(angle: number): ExactRhomb[] {
  if (!Number.isInteger(angle) || angle < 1 || angle > 3) throw new Error('Invalid Sub Rosa rhomb angle.');
  return SUB_ROSA.rules[angle - 1].map(child => exactPrototiles[child.type].map(p =>
    add(child.translation, multiplyByRootPower(p, child.rotation))));
}
