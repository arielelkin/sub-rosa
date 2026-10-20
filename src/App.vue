<!-- Intent: A focused workspace for generating, inspecting, coloring, and exporting Sub Rosa. -->
<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from "vue";
import { PALETTES, type ColorMode } from "./color";
import { drawPatch, exportSvg, type Appearance, type View } from "./render";
import { PAPER_DOI, PAPER_PREPRINT, PAPER_TITLE } from "./research";
import type { Generation, Patch, WorkerReply } from "./tiling";
import { FIELD_OFFSET_LIMIT, FIELD_OFFSET_STEP } from "./fieldWindow";

const generation = ref<Generation>(1);
const fieldSize = ref(60);
const offsetX = ref(0),
  offsetY = ref(0);
const paletteId = ref("earthen");
const colors = ref([...PALETTES[0]!.colors]);
const background = ref(PALETTES[0]!.background);
const edge = ref(PALETTES[0]!.edge);
const mode = ref<ColorMode>("shape");
const phase = ref(0),
  edges = ref(true),
  lineWidth = ref(0.035);
const view: View = { rotation: 0 };
const patch = shallowRef<Patch | null>(null);
const busy = ref(true),
  error = ref("");
const canvas = ref<HTMLCanvasElement>(),
  stage = ref<HTMLElement>(),
  research = ref<HTMLDialogElement>();
const palette = computed(() => PALETTES.find((p) => p.id === paletteId.value));
const appearance = computed<Appearance>(() => ({
  colors: colors.value,
  background: background.value,
  edge: edge.value,
  mode: mode.value,
  phase: phase.value,
  edges: edges.value,
  lineWidth: lineWidth.value,
}));
const count = computed(() => patch.value?.tiles.length.toLocaleString() ?? "—");
const prototiles = [1, 2, 3].map((multiple) => ({
  multiple,
  acuteRadians: `${multiple === 1 ? "" : multiple}π / 7`,
  obtuseRadians: `${7 - multiple}π / 7`,
  acuteDegrees: ((multiple * 180) / 7).toFixed(2),
  obtuseDegrees: (((7 - multiple) * 180) / 7).toFixed(2),
}));
const favicon = `${import.meta.env.BASE_URL}favicon.svg`;
function specimenPoints(index: number): string {
  const halfAngle = ((index + 1) * Math.PI) / 14;
  const x = 100 * Math.cos(halfAngle),
    y = 100 * Math.sin(halfAngle);
  return `${120 - x},80 120,${80 - y} ${120 + x},80 120,${80 + y}`;
}
let worker: Worker | undefined,
  resizeObserver: ResizeObserver | undefined,
  timer: ReturnType<typeof setTimeout> | undefined;
let frame = 0;

function selectPalette(id: string) {
  const p = PALETTES.find((p) => p.id === id)!;
  paletteId.value = id;
  colors.value = [...p.colors];
  background.value = p.background;
  edge.value = p.edge;
}
function customColor() {
  paletteId.value = "custom";
}
function requestDraw() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    if (canvas.value)
      drawPatch(canvas.value, patch.value, appearance.value, view);
  });
}
function resize() {
  if (!canvas.value || !stage.value) return;
  const rect = stage.value.getBoundingClientRect(),
    dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.value.width = Math.round(rect.width * dpr);
  canvas.value.height = Math.round(rect.height * dpr);
  requestDraw();
}
function generate() {
  clearTimeout(timer);
  worker?.terminate();
  worker = undefined;
  busy.value = true;
  error.value = "";
  // Start after controls settle; only the most recent worker is allowed to return a patch.
  timer = setTimeout(() => {
    const current = new Worker(
      new URL("./geometry.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker = current;
    current.onmessage = (event: MessageEvent<WorkerReply>) => {
      if (worker !== current) return;
      if (event.data.ok) {
        patch.value = event.data.patch;
      } else error.value = event.data.error;
      busy.value = false;
      current.terminate();
      worker = undefined;
    };
    current.onerror = () => {
      if (worker !== current) return;
      error.value =
        "The tiling could not be generated. Try a smaller field or another generation.";
      busy.value = false;
      current.terminate();
      worker = undefined;
    };
    current.postMessage({
      generation: generation.value,
      fieldSize: fieldSize.value,
      offset: [offsetX.value, offsetY.value],
    });
  }, 140);
}
function download() {
  if (!patch.value || busy.value || error.value || !stage.value) return;
  const width = 2000,
    height = Math.round(
      (width * stage.value.clientHeight) / stage.value.clientWidth,
    );
  const svg = exportSvg(
    patch.value,
    appearance.value,
    view,
    width,
    height,
    patch.value.sourceGeneration,
  );
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `sub-rosa-n7.3-g${patch.value.sourceGeneration}-${paletteId.value}.svg`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
watch([generation, fieldSize, offsetX, offsetY], generate, { immediate: true });
watch(patch, requestDraw);
watch(appearance, requestDraw, { deep: true });
onMounted(() => {
  resizeObserver = new ResizeObserver(resize);
  if (stage.value) resizeObserver.observe(stage.value);
});
onBeforeUnmount(() => {
  worker?.terminate();
  clearTimeout(timer);
  cancelAnimationFrame(frame);
  resizeObserver?.disconnect();
});
</script>

<template>
  <div class="studio">
    <main>
      <div class="intro">
        <h1 class="wordmark">
          <img :src="favicon" alt="" width="48" height="48" /><span
            >sub rosa<span class="wordmark-dot">.</span></span
          >
        </h1>
        <p class="intro-copy">
          Three rhombi. Fourteen-fold symmetry.<br />Explore the geometry of Sub
          Rosa, one color at a time.
        </p>
      </div>

      <div class="workspace">
        <aside class="controls" aria-label="Tiling controls">
          <section class="control-section">
            <h2><span class="section-number">01</span> The geometry</h2>
            <div class="control-label">
              <span id="generation-label">Generation</span
              ><span class="value-tag">n = 7</span>
            </div>
            <div
              class="segmented"
              role="group"
              aria-labelledby="generation-label"
            >
              <button
                v-for="g in [0, 1, 2] as const"
                :key="g"
                :aria-pressed="generation === g"
                :class="{ selected: generation === g }"
                @click="generation = g"
              >
                {{ ["Seed", "First", "Second"][g]
                }}<span>{{ String(g).padStart(2, "0") }}</span>
              </button>
            </div>
            <div class="field-control" :class="{ muted: generation !== 2 }">
              <label class="control-label" for="field-size"
                >Field size
                <output>{{ fieldSize }} × {{ fieldSize }}</output></label
              >
              <input
                id="field-size"
                v-model.number="fieldSize"
                type="range"
                min="24"
                max="100"
                step="2"
                :disabled="generation !== 2"
                title="Field width and height in unit tile edges; available in the second generation"
              />
            </div>
            <div class="field-control" :class="{ muted: generation !== 2 }">
              <label class="control-label" for="offset-x"
                >X offset <output>{{ offsetX }}</output></label
              >
              <input
                id="offset-x"
                v-model.number="offsetX"
                type="range"
                :min="-FIELD_OFFSET_LIMIT"
                :max="FIELD_OFFSET_LIMIT"
                :step="FIELD_OFFSET_STEP"
                :disabled="generation !== 2"
                title="Select the source field's X offset in unit tile edges; available in the second generation"
              />
            </div>
            <div class="field-control" :class="{ muted: generation !== 2 }">
              <label class="control-label" for="offset-y"
                >Y offset <output>{{ offsetY }}</output></label
              >
              <input
                id="offset-y"
                v-model.number="offsetY"
                type="range"
                :min="-FIELD_OFFSET_LIMIT"
                :max="FIELD_OFFSET_LIMIT"
                :step="FIELD_OFFSET_STEP"
                :disabled="generation !== 2"
                title="Select the source field's Y offset in unit tile edges; available in the second generation"
              />
            </div>
          </section>

          <section class="control-section">
            <h2>
              <span class="section-number">02</span> The palette
              <span v-if="!palette" class="custom-badge">Custom</span>
            </h2>
            <div class="palette-grid" role="group" aria-label="Color palettes">
              <button
                v-for="p in PALETTES"
                :key="p.id"
                class="palette-card"
                :class="{ active: paletteId === p.id }"
                :aria-label="p.name"
                :aria-pressed="paletteId === p.id"
                :title="p.note"
                @click="selectPalette(p.id)"
              >
                <span class="swatches"
                  ><span
                    v-for="c in p.colors"
                    :key="c"
                    :style="{ background: c }"
                  ></span
                ></span>
                <span class="palette-name"
                  >{{ p.name
                  }}<span v-if="paletteId === p.id" aria-hidden="true"
                    >↗</span
                  ></span
                >
              </button>
            </div>
            <label class="control-label color-mode-label" for="color-mode"
              >Color by</label
            >
            <select id="color-mode" v-model="mode">
              <option value="shape">Rhombus shape</option>
              <option value="direction">Edge direction</option>
              <option value="rings">Distance from center</option>
              <option value="lineage">Substitution family</option>
            </select>
            <div class="custom-colors">
              <label
                v-for="(_, index) in colors"
                :key="index"
                class="color-input"
                :title="`Edit color ${index + 1}`"
                ><input
                  v-model="colors[index]"
                  type="color"
                  :aria-label="`Tile color ${index + 1}`"
                  @input="customColor"
                /><span>{{ String(index + 1).padStart(2, "0") }}</span></label
              >
              <button
                class="cycle-button"
                @click="phase = (phase + 1) % 3"
                title="Cycle the color assignments"
                aria-label="Cycle colors"
              >
                ⇄
              </button>
            </div>
          </section>

          <section class="control-section finish-section">
            <h2><span class="section-number">03</span> The finish</h2>
            <div class="finish-row">
              <label for="edges">Tile outlines</label
              ><input
                id="edges"
                v-model="edges"
                class="switch"
                type="checkbox"
              />
            </div>
            <div class="outline-settings" :class="{ muted: !edges }">
              <label class="control-label" for="line-width"
                >Line weight <output>{{ lineWidth.toFixed(3) }}</output></label
              ><input
                id="line-width"
                v-model.number="lineWidth"
                type="range"
                min="0.01"
                max="0.09"
                step="0.005"
                :disabled="!edges"
              />
            </div>
            <div class="finish-row color-row">
              <label for="background">Background</label
              ><input
                id="background"
                v-model="background"
                type="color"
                @input="customColor"
              /><label for="edge-color">Outline</label
              ><input
                id="edge-color"
                v-model="edge"
                type="color"
                :disabled="!edges"
                @input="customColor"
              />
            </div>
          </section>
          <button
            class="export-button"
            aria-label="Download SVG"
            :disabled="busy || !patch || !!error"
            @click="download"
          >
            <span>Download SVG</span><span aria-hidden="true">↓</span>
          </button>
        </aside>

        <div class="preview-column">
          <div
            ref="stage"
            class="stage"
            :style="{ background }"
            :aria-busy="busy"
          >
            <canvas
              ref="canvas"
              role="img"
              aria-label="Sub Rosa tiling preview"
            ></canvas>
            <span class="stage-tag">SUB ROSA <span>N7.3</span></span>
            <div v-if="busy" class="stage-message" role="status">
              <span class="loading-rose">✳</span
              ><span>Growing your tiling…</span>
            </div>
            <div
              v-else-if="error"
              class="stage-message error-message"
              role="alert"
            >
              <p>{{ error }}</p>
              <button @click="generate">Try again</button>
            </div>
          </div>
          <div class="preview-status">
            <div>
              <span class="status-dot" :class="{ working: busy }"></span
              ><span role="status">{{
                busy
                  ? "GENERATING"
                  : error
                    ? "GENERATION FAILED"
                    : `${count} RHOMBI`
              }}</span
              ><span class="status-divider">/</span
              ><span>{{
                generation === 2 ? "BOUNDED FIELD" : "COMPLETE PATCH"
              }}</span>
            </div>
            <span
              v-if="!busy && !error && patch?.sourceGeneration === 3"
              class="source-generation"
              >SOURCE GENERATION 3</span
            >
          </div>
          <section class="prototile-panel" aria-labelledby="prototile-heading">
            <h2 id="prototile-heading">The three prototiles</h2>
            <div class="prototile-grid">
              <article
                v-for="(tile, index) in prototiles"
                :key="tile.multiple"
                class="prototile-card"
                :aria-labelledby="`prototile-${tile.multiple}`"
              >
                <h3 :id="`prototile-${tile.multiple}`">
                  Rhombus {{ tile.multiple }}
                </h3>
                <svg
                  viewBox="0 0 240 160"
                  role="img"
                  :aria-label="`Rhombus with acute angles ${tile.acuteDegrees} degrees and obtuse angles ${tile.obtuseDegrees} degrees`"
                >
                  <polygon
                    :points="specimenPoints(index)"
                    :fill="colors[(index + phase) % 3]"
                  />
                </svg>
                <dl class="prototile-angles">
                  <div>
                    <dt>Acute angle</dt>
                    <dd>
                      <span>{{ tile.acuteDegrees }}°</span
                      ><small>{{ tile.acuteRadians }}</small>
                    </dd>
                  </div>
                  <div>
                    <dt>Obtuse angle</dt>
                    <dd>
                      <span>{{ tile.obtuseDegrees }}°</span
                      ><small>{{ tile.obtuseRadians }}</small>
                    </dd>
                  </div>
                </dl>
              </article>
            </div>
          </section>
        </div>
      </div>
    </main>

    <footer>
      <p>
        Built on the research of
        <button class="inline-link" @click="research?.showModal()">
          Jarkko Kari &amp; Markus Rissanen</button
        >.
      </p>
    </footer>

    <dialog
      ref="research"
      class="research-dialog"
      aria-labelledby="research-title"
    >
      <button
        class="dialog-close"
        aria-label="Close research credits"
        @click="research?.close()"
      >
        ×
      </button>
      <p class="eyebrow">THE IDEAS BEHIND THE PATTERN</p>
      <h2 id="research-title">Under the rose.</h2>
      <p>
        Sub Rosa is a family of quasiperiodic rhombic substitution tilings
        developed by <strong>Jarkko Kari and Markus Rissanen</strong>. This
        studio explores the <strong>n = 7</strong> construction, using three
        unit-edge rhombi and a seed with fourteen-fold rotational symmetry.
      </p>
      <p>
        Each generation inflates the rhombi and replaces them with smaller
        rhombus patches. Their jagged boundaries interlock. The seed and first
        generation show complete finite patches; the second generation shows
        whole tiles meeting a bounded square field.
      </p>
      <div class="citation">
        <span class="eyebrow">PRIMARY REFERENCE</span>
        <p>
          Jarkko Kari and Markus Rissanen (2016). <cite>{{ PAPER_TITLE }}</cite
          >. <em>Discrete &amp; Computational Geometry</em>,
          <strong>55</strong>, 972–996.
        </p>
        <a :href="PAPER_DOI" target="_blank" rel="noopener noreferrer"
          >Published paper ↗</a
        ><a :href="PAPER_PREPRINT" target="_blank" rel="noopener noreferrer"
          >Open-access preprint ↗</a
        >
      </div>
      <h3>From research to this studio</h3>
      <p>
        The exact n7.3 substitution rules and arithmetic are reused from
        <strong>Aricatadora</strong>. The rule interiors were recovered there
        from Markus Rissanen’s original diagrams,
        <cite>n7.3 S123 Lines 100.pdf</cite> and
        <cite>n7.3 koko Green200.pdf</cite>, and checked against his 26,656-tile
        rosette. Coordinates use exact arithmetic in ℤ[ζ₂₈] until rendering.
      </p>
      <p>
        The palettes and coloring modes are exploratory choices in this app. The
        research credit and diagram provenance are embedded in every downloaded
        SVG.
      </p>
    </dialog>
  </div>
</template>
