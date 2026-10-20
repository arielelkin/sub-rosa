// Intent: Deterministic, geometry-independent color assignments and a small curated palette library.
import type { Tile } from "./tiling";
export type ColorMode = "shape" | "direction" | "rings" | "lineage";
export interface Palette {
  id: string;
  name: string;
  note: string;
  colors: [string, string, string];
  background: string;
  edge: string;
}
export const PALETTES: Palette[] = [
  {
    id: "earthen",
    name: "Earthen",
    note: "Clay · ochre · chalk",
    colors: ["#bd6549", "#d7ab64", "#e9dfc8"],
    background: "#222b2b",
    edge: "#222b2b",
  },
  {
    id: "botanical",
    name: "Botanical",
    note: "Moss · sage · parchment",
    colors: ["#4c6653", "#9dad89", "#e6dfbb"],
    background: "#1b2824",
    edge: "#1b2824",
  },
  {
    id: "azulejo",
    name: "Azulejo",
    note: "Cobalt · sky · porcelain",
    colors: ["#2e548c", "#8eacbf", "#eee7d7"],
    background: "#172d46",
    edge: "#172d46",
  },
  {
    id: "rose",
    name: "Rose garden",
    note: "Burgundy · rose · blush",
    colors: ["#79414d", "#bd7f86", "#e5c4b6"],
    background: "#30242a",
    edge: "#30242a",
  },
  {
    id: "nocturne",
    name: "Nocturne",
    note: "Indigo · lavender · gold",
    colors: ["#636288", "#b7b0cd", "#cfaa61"],
    background: "#1e2031",
    edge: "#1e2031",
  },
  {
    id: "graphite",
    name: "Graphite",
    note: "Ink · stone · paper",
    colors: ["#525752", "#9c9f95", "#e4e4d9"],
    background: "#242824",
    edge: "#242824",
  },
];
export function colorIndex(tile: Tile, mode: ColorMode, phase: number): number {
  let index: number;
  switch (mode) {
    case "shape":
      index = tile.type;
      break;
    case "direction":
      index = tile.orientation;
      break;
    case "rings":
      index = Math.floor(Math.hypot(...tile.center) / 2.5);
      break;
    case "lineage":
      index = tile.lineage;
      break;
  }
  return (((index + phase) % 3) + 3) % 3;
}
