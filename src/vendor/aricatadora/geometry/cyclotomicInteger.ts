// Intent: Exact integer arithmetic in the cyclotomic ring Z[zeta_m], so that n-fold substitution
// geometry can be built, compared, and audited without floating-point tolerances. Points in the
// plane are ring elements read as complex numbers; float coordinates are produced only at the end.
//
// Navigation: createCyclotomicRing builds Phi_m and the powers of zeta once. Everything below it is
// pure arithmetic on integer coefficient vectors. The tiling-facing helpers at the bottom
// (edgeVector, inflationFactor) express the two quantities every cyclotomic substitution needs.
//
// Substitution rules use these values as their authored representation. Rendering and export only
// see coordinates after the explicit float conversion in cyclotomicSubstitution.ts.

function requireSafeInteger(value: number, operation: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new Error(
      `Cyclotomic ${operation} produced ${value}, outside JavaScript's exact integer range.`
    );
  }
  return value;
}

function exactAdd(left: number, right: number): number {
  return requireSafeInteger(left + right, "addition");
}

function exactSubtract(left: number, right: number): number {
  return requireSafeInteger(left - right, "subtraction");
}

function exactMultiply(left: number, right: number): number {
  return requireSafeInteger(left * right, "multiplication");
}

export interface CyclotomicRing {
  /** m in zeta_m = exp(2*pi*i/m). An n-fold tiling uses m = 2n, so zeta = exp(i*pi/n). */
  readonly order: number;
  /** Euler totient of the order; the number of integer coefficients per element. */
  readonly degree: number;
  /** Phi_m coefficients in ascending power order; monic, so the last entry is 1. */
  readonly minimalPolynomial: readonly number[];
  /** zeta^k reduced to the standard basis, for k in [0, order). */
  readonly rootPowers: readonly (readonly number[])[];
}

export interface CyclotomicInteger {
  readonly ring: CyclotomicRing;
  /** Coefficients over the basis 1, zeta, ..., zeta^(degree-1). */
  readonly coefficients: readonly number[];
}

function trimTrailingZeros(coefficients: readonly number[]): number[] {
  const trimmed = [...coefficients];
  while (trimmed.length > 0 && trimmed[trimmed.length - 1] === 0) trimmed.pop();
  return trimmed;
}

/** Exact quotient of integer polynomials; the divisor must be monic so no rounding occurs. */
function divideMonicPolynomials(
  dividend: readonly number[],
  divisor: readonly number[]
): number[] {
  const numerator = [...dividend];
  const divisorDegree = divisor.length - 1;
  if (divisor[divisorDegree] !== 1) {
    throw new Error("Cyclotomic polynomial division requires a monic divisor.");
  }
  const quotient = new Array<number>(Math.max(0, numerator.length - divisorDegree)).fill(0);
  for (let power = numerator.length - 1; power >= divisorDegree; power -= 1) {
    const factor = numerator[power];
    if (factor === 0) continue;
    quotient[power - divisorDegree] = factor;
    for (let offset = 0; offset <= divisorDegree; offset += 1) {
      numerator[power - divisorDegree + offset] = exactSubtract(
        numerator[power - divisorDegree + offset],
        exactMultiply(factor, divisor[offset])
      );
    }
  }
  if (trimTrailingZeros(numerator).length !== 0) {
    throw new Error("Cyclotomic polynomial division left a non-zero remainder.");
  }
  return quotient;
}

function divisorsBelow(order: number): number[] {
  const divisors: number[] = [];
  for (let candidate = 1; candidate < order; candidate += 1) {
    if (order % candidate === 0) divisors.push(candidate);
  }
  return divisors;
}

/** Phi_m = (x^m - 1) divided by every Phi_d for proper divisors d of m. */
function cyclotomicPolynomial(order: number, memo: Map<number, number[]>): number[] {
  const cached = memo.get(order);
  if (cached) return cached;
  let polynomial = new Array<number>(order + 1).fill(0);
  polynomial[0] = -1;
  polynomial[order] = 1;
  for (const divisor of divisorsBelow(order)) {
    polynomial = divideMonicPolynomials(polynomial, cyclotomicPolynomial(divisor, memo));
  }
  memo.set(order, polynomial);
  return polynomial;
}

/** Reduce an arbitrary-degree integer polynomial modulo Phi_m. */
function reduceModuloMinimalPolynomial(
  coefficients: readonly number[],
  minimalPolynomial: readonly number[]
): number[] {
  const degree = minimalPolynomial.length - 1;
  const working = [...coefficients];
  for (let power = working.length - 1; power >= degree; power -= 1) {
    const factor = working[power];
    if (factor === 0) continue;
    working[power] = 0;
    for (let offset = 0; offset < degree; offset += 1) {
      working[power - degree + offset] = exactSubtract(
        working[power - degree + offset],
        exactMultiply(factor, minimalPolynomial[offset])
      );
    }
  }
  const reduced = working.slice(0, degree);
  while (reduced.length < degree) reduced.push(0);
  return reduced;
}

export function createCyclotomicRing(order: number): CyclotomicRing {
  if (!Number.isInteger(order) || order < 1) {
    throw new Error(`Cyclotomic order must be a positive integer; received ${order}.`);
  }
  const minimalPolynomial = cyclotomicPolynomial(order, new Map());
  const degree = minimalPolynomial.length - 1;
  const rootPowers: number[][] = [];
  for (let power = 0; power < order; power += 1) {
    const monomial = new Array<number>(power + 1).fill(0);
    monomial[power] = 1;
    rootPowers.push(reduceModuloMinimalPolynomial(monomial, minimalPolynomial));
  }
  return { order, degree, minimalPolynomial, rootPowers };
}

function guardCoefficients(ring: CyclotomicRing, coefficients: readonly number[]): number[] {
  const guarded = coefficients.slice(0, ring.degree);
  while (guarded.length < ring.degree) guarded.push(0);
  for (const coefficient of guarded) {
    if (!Number.isSafeInteger(coefficient)) {
      throw new Error(
        `Cyclotomic coefficient ${coefficient} is outside JavaScript's exact integer range.`
      );
    }
  }
  return guarded;
}

function element(ring: CyclotomicRing, coefficients: readonly number[]): CyclotomicInteger {
  return { ring, coefficients: guardCoefficients(ring, coefficients) };
}

function requireSameRing(left: CyclotomicInteger, right: CyclotomicInteger): CyclotomicRing {
  if (left.ring.order !== right.ring.order) {
    throw new Error(
      `Cannot combine elements of Z[zeta_${left.ring.order}] and Z[zeta_${right.ring.order}].`
    );
  }
  return left.ring;
}

export function zero(ring: CyclotomicRing): CyclotomicInteger {
  return element(ring, new Array<number>(ring.degree).fill(0));
}

export function fromInteger(ring: CyclotomicRing, value: number): CyclotomicInteger {
  const coefficients = new Array<number>(ring.degree).fill(0);
  coefficients[0] = value;
  return element(ring, coefficients);
}

/** Construct an element from its standard-basis coefficients. */
export function fromCoefficients(
  ring: CyclotomicRing,
  coefficients: readonly number[]
): CyclotomicInteger {
  if (coefficients.length !== ring.degree) {
    throw new Error(
      `Z[zeta_${ring.order}] needs ${ring.degree} coefficients; received ${coefficients.length}.`
    );
  }
  return element(ring, coefficients);
}

export function one(ring: CyclotomicRing): CyclotomicInteger {
  return fromInteger(ring, 1);
}

/** zeta^power, with the exponent taken modulo the ring order. */
export function rootPower(ring: CyclotomicRing, power: number): CyclotomicInteger {
  if (!Number.isInteger(power)) {
    throw new Error(`Root-of-unity exponents must be integers; received ${power}.`);
  }
  const wrapped = ((power % ring.order) + ring.order) % ring.order;
  return element(ring, ring.rootPowers[wrapped]);
}

export function add(left: CyclotomicInteger, right: CyclotomicInteger): CyclotomicInteger {
  const ring = requireSameRing(left, right);
  return element(
    ring,
    left.coefficients.map((coefficient, index) =>
      exactAdd(coefficient, right.coefficients[index])
    )
  );
}

export function subtract(left: CyclotomicInteger, right: CyclotomicInteger): CyclotomicInteger {
  const ring = requireSameRing(left, right);
  return element(
    ring,
    left.coefficients.map((coefficient, index) =>
      exactSubtract(coefficient, right.coefficients[index])
    )
  );
}

export function scale(value: CyclotomicInteger, factor: number): CyclotomicInteger {
  if (!Number.isInteger(factor)) {
    throw new Error(`Cyclotomic scaling requires an integer factor; received ${factor}.`);
  }
  return element(
    value.ring,
    value.coefficients.map((coefficient) => exactMultiply(coefficient, factor))
  );
}

export function multiply(left: CyclotomicInteger, right: CyclotomicInteger): CyclotomicInteger {
  const ring = requireSameRing(left, right);
  const product = new Array<number>(2 * ring.degree - 1).fill(0);
  for (let leftPower = 0; leftPower < ring.degree; leftPower += 1) {
    const leftCoefficient = left.coefficients[leftPower];
    if (leftCoefficient === 0) continue;
    for (let rightPower = 0; rightPower < ring.degree; rightPower += 1) {
      product[leftPower + rightPower] = exactAdd(
        product[leftPower + rightPower],
        exactMultiply(leftCoefficient, right.coefficients[rightPower])
      );
    }
  }
  return element(ring, reduceModuloMinimalPolynomial(product, ring.minimalPolynomial));
}

/** Rotation by power * (2*pi/m); the workhorse of every cyclotomic substitution rule. */
export function multiplyByRootPower(
  value: CyclotomicInteger,
  power: number
): CyclotomicInteger {
  return multiply(value, rootPower(value.ring, power));
}

/** Complex conjugation, which is the reflection every mirrored substitution child needs. */
export function conjugate(value: CyclotomicInteger): CyclotomicInteger {
  const { ring } = value;
  let total = zero(ring);
  for (let power = 0; power < ring.degree; power += 1) {
    const coefficient = value.coefficients[power];
    if (coefficient === 0) continue;
    total = add(total, scale(rootPower(ring, ring.order - power), coefficient));
  }
  return total;
}

export function equals(left: CyclotomicInteger, right: CyclotomicInteger): boolean {
  requireSameRing(left, right);
  return left.coefficients.every((coefficient, index) => coefficient === right.coefficients[index]);
}

/** A canonical string key, so exact vertex identity can drive a Map without any epsilon. */
export function coefficientKey(value: CyclotomicInteger): string {
  return value.coefficients.join(",");
}

export function toComplex(value: CyclotomicInteger): readonly [number, number] {
  const angle = (2 * Math.PI) / value.ring.order;
  let real = 0;
  let imaginary = 0;
  value.coefficients.forEach((coefficient, power) => {
    if (coefficient === 0) return;
    real += coefficient * Math.cos(angle * power);
    imaginary += coefficient * Math.sin(angle * power);
  });
  return [real, imaginary];
}

/**
 * The quantum integer [j] = sin(j*theta)/sin(theta) for theta = 2*pi/m, which is exactly the ratio
 * of the j-th chord to the shortest chord. In an n-fold cyclotomic tiling with m = 2n these are the
 * only edge lengths that occur, and each one is an algebraic integer of this ring.
 */
export function chordLength(ring: CyclotomicRing, lengthIndex: number): CyclotomicInteger {
  if (!Number.isInteger(lengthIndex) || lengthIndex < 1) {
    throw new Error(`Chord length index must be a positive integer; received ${lengthIndex}.`);
  }
  let total = zero(ring);
  for (let term = 0; term < lengthIndex; term += 1) {
    total = add(total, rootPower(ring, lengthIndex - 1 - 2 * term));
  }
  return total;
}

/**
 * One edge of a prototile: the chord of the given length index pointing along direction index
 * steps of 2*pi/m. This is the exact counterpart of the (lengthIndex, directionIndex) edge walks
 * that already describe the cyclotomic trapezoid prototiles.
 */
export function edgeVector(
  ring: CyclotomicRing,
  lengthIndex: number,
  directionIndex: number
): CyclotomicInteger {
  return multiplyByRootPower(chordLength(ring, lengthIndex), directionIndex);
}

/**
 * The inflation multiplier 1 + 2*cos(2*pi/m) = 1 + zeta + zeta^-1. Substitutions are composed by
 * inflating the parent rather than contracting the children, which is what keeps every coordinate
 * an exact ring element instead of an unrepresentable reciprocal.
 */
export function inflationFactor(ring: CyclotomicRing): CyclotomicInteger {
  return add(add(one(ring), rootPower(ring, 1)), rootPower(ring, -1));
}
