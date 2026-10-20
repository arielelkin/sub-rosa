# Sub Rosa Studio

A standalone Vue 3 + TypeScript app for generating and coloring **Sub Rosa n7.3**. No backend, account, external font service, or sibling checkout is needed at runtime.

```sh
git clone https://github.com/arielelkin/sub-rosa.git
cd sub-rosa
npm ci
npm run dev
```

Open the local URL printed by Vite. `npm run build` typechecks and creates `dist/`; `npm run preview` serves that production build. Deploy `dist/` to any static host (including a subdirectory); the app requires HTTP rather than opening `index.html` directly because it uses a module worker.

## Controls

- **Seed / First / Second:** exact substitution generations 0–2. The first two are complete patches (14 and 2,968 tiles). The second generation keeps whole tiles intersecting a centered square field, 24–100 unit edges across. It is a finite window into the tiling, not a periodic repeating texture.
- **X/Y offset:** move the source field by −1,000 to +1,000 unit tile edges, using Aricatadora main's field-window formulas and coverage check. Enabled for Second. Distant fields automatically use source generation 3, indicated below the preview. The selected patch stays centered; offsets choose different geometry rather than panning the canvas. SVG metadata includes the actual source generation and offsets.
- Six palettes, custom tile/background/outline colors, color cycling, and coloring by rhombus shape, edge direction, distance from the center, or substitution family.
- The canvas stays centered and automatically fits the selected patch. It has no view controls; scrolling over the canvas scrolls the page.
- The prototile panel shows large, equally scaled rhombi with their acute and obtuse angles in degrees and exact multiples of π / 7. Each displayed angle occurs at two opposite corners.
- **Download SVG** saves the current view as vector artwork with the full research citation and source-diagram provenance in `<desc>` and `<metadata>`.

Geometry generation runs in a cancellable worker. Palette changes only recolor the existing geometry.

## Research and attribution

**Jarkko Kari and Markus Rissanen (2016).** “Sub Rosa, a system of quasiperiodic rhombic substitution tilings with n-fold rotational symmetry.” _Discrete & Computational Geometry_ **55**, 972–996. [Published paper, DOI: 10.1007/s00454-016-9779-1](https://doi.org/10.1007/s00454-016-9779-1). [Open preprint: arXiv:1512.01402](https://arxiv.org/abs/1512.01402); [n = 7 construction, §3.3](https://arxiv.org/html/1512.01402v2#S3.SS3).

Credit belongs to both authors for the mathematical construction. This app explores the n = 7 case, with three unit-edge rhombus shapes and a fourteen-fold symmetric seed. Palettes and coloring modes are presentation choices, independent of the research construction. See [CITATION.bib](./CITATION.bib).

### Reused implementation

The eight TypeScript files in [`src/vendor/aricatadora`](./src/vendor/aricatadora) are **byte-for-byte copies** from Aricatadora commit `41cf9fe9bb0003aecc3aac365d0cc83c433a84b0`. [`provenance.json`](./src/vendor/aricatadora/provenance.json) records their source paths and SHA-256 digests. The local adapter in [`src/tiling.ts`](./src/tiling.ts) calls that original exact expansion engine; it does not substitute a multigrid approximation or recreate the rule interiors.

Aricatadora recovered the n7.3 rule interiors from **Markus Rissanen’s original diagrams**, `n7.3 S123 Lines 100.pdf` and `n7.3 koko Green200.pdf`. Its verification matches all 26,656 rosette faces and accounts for 168 exterior-owned boundary tiles. The three substitution interiors have 212, 380, and 472 children. Coordinates remain in ℤ[ζ₂₈] until conversion for rendering. Original source diagrams are not bundled here; the recovered data and its verification metadata are retained unchanged.

Research credits are visible in the footer and the research dialog opened by the authors’ names, as well as in exported SVGs. Vendoring this implementation does not assign a new license to the original code or diagrams. Bundled DM Sans and Manrope fonts use the SIL Open Font License; notices are in `public/licenses/` and included in the build.

## Verification

```sh
npm test
npm run build
npm run test:e2e
```

Unit tests verify the original source digests, replacement counts, unit edges, central symmetry, bounded and offset field coverage, color assignment, and export attribution. Browser tests exercise the production worker, generation, offset and palette controls, custom colors, SVG downloads, research links, and a narrow layout with external network access blocked. Tests use the existing mise-managed Chrome binary, resolved through `PLAYWRIGHT_MCP_EXECUTABLE_PATH` or `mise which chrome`; no separate browser download is needed.
