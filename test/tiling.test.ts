// Intent: Certify reused source integrity, published rule counts, rendered geometry, and credited exports.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { colorIndex, PALETTES, type ColorMode } from "../src/color";
import { exportSvg, type Appearance } from "../src/render";
import { generatePatch } from "../src/tiling";
import { toComplex } from "../src/vendor/aricatadora/geometry/cyclotomicInteger";
import { SUB_ROSA } from "../src/vendor/aricatadora/tilings/substitutions/sub-rosa/data";
import {
  polygonSignedArea,
  simplePolygonIntersectionArea,
} from "../src/vendor/aricatadora/tilings/substitutions/engine";
import provenance from "../src/vendor/aricatadora/provenance.json";

describe("Aricatadora geometry reuse", () => {
  it("retains every vendored source byte for byte", () => {
    for (const file of provenance.files) {
      const bytes = readFileSync(
        new URL(`../src/vendor/aricatadora/${file.path}`, import.meta.url),
      );
      expect(createHash("sha256").update(bytes).digest("hex"), file.path).toBe(
        file.sha256,
      );
    }
  });
  it("preserves all three original replacement interiors", () => {
    expect(SUB_ROSA.rules.map((rule) => rule.length)).toEqual([212, 380, 472]);
  });
  it("expands the 14-tile seed to the complete 2,968-tile first generation", () => {
    expect(
      generatePatch({ generation: 0, fieldSize: 60, offset: [0, 0] }).tiles,
    ).toHaveLength(14);
    const patch = generatePatch({
      generation: 1,
      fieldSize: 60,
      offset: [0, 0],
    });
    expect(patch.tiles).toHaveLength(2968);
    expect(new Set(patch.tiles.map((t) => t.type))).toEqual(new Set([0, 1, 2]));
    const centroids = patch.tiles.map((t) =>
      t.center.map((p) => p.toFixed(7)).join(","),
    );
    expect(new Set(centroids).size).toBe(patch.tiles.length);
    // Rendering adapter retains unit-edge rhombi and the original central symmetry.
    const keys = new Set(
      patch.tiles.map((t) =>
        t.center.map((p) => Math.round(p * 1e6)).join(","),
      ),
    );
    for (const tile of patch.tiles) {
      for (let i = 0; i < 4; i++) {
        const a = tile.points[i]!,
          b = tile.points[(i + 1) % 4]!;
        expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeCloseTo(1, 8);
      }
      expect(
        keys.has(tile.center.map((p) => Math.round(-p * 1e6)).join(",")),
      ).toBe(true);
    }
  });
  it.each([24, 60, 100])(
    "covers a bounded second-generation field of %i unit edges with whole tiles",
    (size) => {
      const patch = generatePatch({
        generation: 2,
        fieldSize: size,
        offset: [0, 0],
      });
      const half = size / 2;
      const window = [
        [-half, -half],
        [half, -half],
        [half, half],
        [-half, half],
      ] as const;
      const area = patch.tiles.reduce(
        (sum, tile) => sum + simplePolygonIntersectionArea(tile.points, window),
        0,
      );
      expect(area).toBeCloseTo(size ** 2, 6);
      expect(
        patch.tiles.every(
          (tile) =>
            tile.points.length === 4 &&
            Math.abs(polygonSignedArea(tile.points)) > 0,
        ),
      ).toBe(true);
      expect(patch.tiles.length).toBeLessThan(20_000);
    },
  );
  it.each([
    [80, -60],
    [1000, 1000],
    [-1000, -1000],
  ])("selects and recenters a fully covered source field at %i, %i", (x, y) => {
    const patch = generatePatch({
      generation: 2,
      fieldSize: 100,
      offset: [x, y],
    });
    expect(patch.offset).toEqual([x, y]);
    if (Math.abs(x) === 1000) expect(patch.sourceGeneration).toBe(3);
    const rectangle = [
      [-50, -50],
      [50, -50],
      [50, 50],
      [-50, 50],
    ] as const;
    expect(
      patch.tiles.reduce(
        (sum, tile) =>
          sum + simplePolygonIntersectionArea(tile.points, rectangle),
        0,
      ),
    ).toBeCloseTo(10000, 6);
    expect(Math.abs((patch.bounds.minX + patch.bounds.maxX) / 2)).toBeLessThan(
      1,
    );
    expect(Math.abs((patch.bounds.minY + patch.bounds.maxY) / 2)).toBeLessThan(
      1,
    );
  });
  it.each([
    [1, 0, 0],
    [2, 0, 0],
    [2, 80, -60],
    [2, 1000, -1000],
  ] as const)("aligns inflated parent guides at generation %i, offset %i, %i", (generation, x, y) => {
    const patch = generatePatch({ generation, fieldSize: 60, offset: [x, y] });
    const inflation = toComplex(SUB_ROSA.inflation)[0];
    const coarse = generatePatch({
      generation: (patch.sourceGeneration - 1) as 0 | 1 | 2,
      fieldSize: 24,
      offset: [x / inflation, y / inflation],
    });
    const key = (points: readonly (readonly number[])[]) =>
      points.map((p) => p.map((v) => Math.round(v * 1e6)).join(",")).join(";");
    const candidates = new Set(coarse.tiles.map((tile) =>
      key(tile.points.map(([px, py]) => [
        px * inflation - (coarse.sourceGeneration < 2 ? x : 0),
        py * inflation - (coarse.sourceGeneration < 2 ? y : 0),
      ]))));
    expect(patch.superRhombi.length).toBeGreaterThan(0);
    if (generation === 1) expect(patch.superRhombi).toHaveLength(14);
    for (const points of patch.superRhombi) {
      expect(candidates.has(key(points))).toBe(true);
      for (let i = 0; i < 4; i++) {
        const a = points[i]!, b = points[(i + 1) % 4]!;
        expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeCloseTo(inflation, 8);
      }
    }
  });
  it("has no inflated parent guides in the seed", () => {
    expect(generatePatch({ generation: 0, fieldSize: 60, offset: [0, 0] }).superRhombi).toEqual([]);
  });
  it("ignores retained offsets when showing a complete seed", () => {
    expect(
      generatePatch({ generation: 0, fieldSize: 60, offset: [1000, -1000] }),
    ).toEqual(generatePatch({ generation: 0, fieldSize: 60, offset: [0, 0] }));
  });
  it("rejects unsupported generations and unbounded fields", () => {
    expect(() =>
      generatePatch({ generation: 3 as 2, fieldSize: 60, offset: [0, 0] }),
    ).toThrow("generation");
    expect(() =>
      generatePatch({ generation: 2, fieldSize: Infinity, offset: [0, 0] }),
    ).toThrow("Field size");
    expect(() =>
      generatePatch({ generation: 2, fieldSize: 60, offset: [1001, 0] }),
    ).toThrow("Field offsets");
  });
});

describe("appearance and export", () => {
  const patch = generatePatch({ generation: 0, fieldSize: 60, offset: [0, 0] });
  const p = PALETTES[0]!;
  const appearance: Appearance = {
    ...p,
    mode: "shape",
    phase: 0,
    edges: true,
    superRhombusOutlines: false,
    lineWidth: 0.035,
  };
  it.each(["shape", "direction", "rings", "lineage"] as ColorMode[])(
    "assigns stable valid colors by %s",
    (mode) => {
      const indices = patch.tiles.map((t) => colorIndex(t, mode, 0));
      expect(indices.every((i) => i >= 0 && i < 3 && Number.isInteger(i))).toBe(
        true,
      );
      expect(patch.tiles.map((t) => colorIndex(t, mode, 3))).toEqual(indices);
    },
  );
  it("exports independently toggled guides clipped to the tile patch", () => {
    const first = generatePatch({ generation: 1, fieldSize: 60, offset: [0, 0] });
    const svg = (enabled: boolean) => exportSvg(first,
      { ...appearance, edges: false, superRhombusOutlines: enabled },
      { rotation: 0 }, 2000, 1600, 1);
    expect(svg(false)).not.toContain('data-layer="super-rhombi"');
    expect(svg(true)).toContain('data-layer="super-rhombi"');
    expect(svg(true)).toContain('clip-path="url(#patch-clip)"');
    expect(svg(true)).toContain('stroke-width="0.12"');
    expect(svg(true).match(/<polygon /g)).toHaveLength(first.tiles.length);
  });
  it("exports vector geometry and a full research citation with diagram provenance", () => {
    const svg = exportSvg(
      patch,
      appearance,
      { rotation: 0 },
      2000,
      1600,
      0,
    );
    expect(svg.match(/<polygon /g)).toHaveLength(14);
    expect(svg).toContain("Jarkko Kari and Markus Rissanen");
    expect(svg).toContain("10.1007/s00454-016-9779-1");
    expect(svg).toContain("https://arxiv.org/abs/1512.01402");
    expect(svg).toContain("n7.3 S123 Lines 100.pdf");
    expect(svg).toContain("n7.3 koko Green200.pdf");
    expect(svg).toContain("Aricatadora");
    expect(svg).toContain('stroke-width="0.035"');
    expect(svg).not.toContain("<script");
  });
});
