// Intent: Share the same composition transform and color mapping between canvas preview and SVG export.
import { colorIndex, type ColorMode } from "./color";
import { IMPLEMENTATION_CREDIT, RESEARCH_CREDIT } from "./research";
import type { Patch } from "./tiling";
export interface Appearance {
  colors: readonly string[];
  background: string;
  edge: string;
  mode: ColorMode;
  phase: number;
  edges: boolean;
  lineWidth: number;
}
export interface View {
  rotation: number;
}
export function fitScale(patch: Patch, width: number, height: number): number {
  return (
    Math.min(
      width / (patch.bounds.maxX - patch.bounds.minX),
      height / (patch.bounds.maxY - patch.bounds.minY),
    ) * 0.88
  );
}
export function composition(
  patch: Patch,
  width: number,
  height: number,
  view: View,
) {
  const scale = fitScale(patch, width, height);
  const angle = (view.rotation * Math.PI) / 180;
  const cx = (patch.bounds.maxX + patch.bounds.minX) / 2,
    cy = (patch.bounds.maxY + patch.bounds.minY) / 2;
  return {
    scale,
    angle,
    cx,
    cy,
    tx: width / 2,
    ty: height / 2,
  };
}
export function drawPatch(
  canvas: HTMLCanvasElement,
  patch: Patch | null,
  appearance: Appearance,
  view: View,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = appearance.background;
  ctx.fillRect(0, 0, width, height);
  if (!patch) return;
  const t = composition(patch, width, height, view);
  ctx.save();
  ctx.translate(t.tx, t.ty);
  ctx.rotate(t.angle);
  ctx.scale(t.scale, -t.scale);
  ctx.translate(-t.cx, -t.cy);
  ctx.lineJoin = "round";
  ctx.strokeStyle = appearance.edge;
  ctx.lineWidth = appearance.lineWidth;
  for (const tile of patch.tiles) {
    ctx.beginPath();
    tile.points.forEach(([x, y], i) =>
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y),
    );
    ctx.closePath();
    ctx.fillStyle =
      appearance.colors[colorIndex(tile, appearance.mode, appearance.phase)]!;
    ctx.fill();
    if (appearance.edges) ctx.stroke();
  }
  ctx.restore();
}
function escapeXml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
}
export function exportSvg(
  patch: Patch,
  appearance: Appearance,
  view: View,
  width: number,
  height: number,
  generation: number,
): string {
  const t = composition(patch, width, height, view);
  const paths = patch.tiles
    .map(
      (tile) =>
        `<polygon points="${tile.points.map((p) => p.join(",")).join(" ")}" fill="${escapeXml(appearance.colors[colorIndex(tile, appearance.mode, appearance.phase)]!)}"/>`,
    )
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
<title id="title">Sub Rosa n7.3 — generation ${generation}</title>
<desc id="desc">${escapeXml(RESEARCH_CREDIT + "\n" + IMPLEMENTATION_CREDIT)}</desc>
<metadata>${escapeXml(JSON.stringify({ construction: "Sub Rosa n7.3", generation, offset: patch.offset, tileCount: patch.tiles.length, research: RESEARCH_CREDIT, source: IMPLEMENTATION_CREDIT, appearance, view }))}</metadata>
<rect width="100%" height="100%" fill="${escapeXml(appearance.background)}"/>
<g transform="translate(${t.tx} ${t.ty}) rotate(${view.rotation}) scale(${t.scale} ${-t.scale}) translate(${-t.cx} ${-t.cy})" stroke="${appearance.edges ? escapeXml(appearance.edge) : "none"}" stroke-width="${appearance.lineWidth}" stroke-linejoin="round">
${paths}
</g></svg>`;
}
