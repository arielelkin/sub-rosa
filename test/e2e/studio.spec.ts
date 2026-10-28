// Intent: Verify the standalone studio's complete user flow with its production worker and downloaded artwork.
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("generate, color, inspect, and export a credited tiling", async ({
  page,
}) => {
  const errors: string[] = [];
  await page.setViewportSize({ width: 1280, height: 1100 });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByText("2,968 RHOMBI")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("sub rosa.");
  await expect(page.locator("header")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "The research" })).toHaveCount(
    0,
  );
  await expect(page.locator(".stage button")).toHaveCount(0);
  const prototiles = page.getByRole("region", { name: "The three prototiles" });
  await expect(prototiles.getByRole("article")).toHaveCount(3);
  for (const [index, angles] of [
    ["25.71°", "154.29°", "π / 7", "6π / 7"],
    ["51.43°", "128.57°", "2π / 7", "5π / 7"],
    ["77.14°", "102.86°", "3π / 7", "4π / 7"],
  ].entries()) {
    const card = prototiles.getByRole("article").nth(index);
    for (const angle of angles)
      await expect(card.getByText(angle, { exact: true })).toBeVisible();
    const bounds = (await card.locator("svg").boundingBox())!;
    expect(bounds.width).toBeGreaterThan(150);
    expect(bounds.height).toBeGreaterThanOrEqual(150);
  }
  const shapes = await prototiles.locator("polygon").evaluateAll((elements) =>
    elements.map((element) => {
      const polygon = element as SVGPolygonElement;
      const points = Array.from(
        { length: polygon.points.numberOfItems },
        (_, i) => polygon.points.getItem(i),
      );
      const edges = points.map((point, i) =>
        Math.hypot(
          point.x - points[(i + 1) % 4]!.x,
          point.y - points[(i + 1) % 4]!.y,
        ),
      );
      const left = points[0]!,
        top = points[1]!,
        bottom = points[3]!;
      const ax = top.x - left.x,
        ay = top.y - left.y,
        bx = bottom.x - left.x,
        by = bottom.y - left.y;
      const transform = polygon.getScreenCTM()!;
      return {
        edges,
        acuteDegrees:
          (Math.acos(
            (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by)),
          ) *
            180) /
          Math.PI,
        renderedEdge: Math.hypot(
          transform.a * ax + transform.c * ay,
          transform.b * ax + transform.d * ay,
        ),
      };
    }),
  );
  for (const [i, shape] of shapes.entries()) {
    expect(shape.acuteDegrees).toBeCloseTo([25.71, 51.43, 77.14][i]!, 2);
    // SVGPointList stores float32 coordinates even though the authored vertices are doubles.
    for (const edge of shape.edges) expect(edge).toBeCloseTo(100, 4);
    expect(Math.abs(shape.renderedEdge - shapes[0]!.renderedEdge)).toBeLessThan(
      0.05,
    );
  }
  await expect(page.getByLabel("Field size")).toBeDisabled();
  await expect(page.getByLabel("X offset")).toBeDisabled();
  await expect(page.getByLabel("Y offset")).toBeDisabled();
  await page.getByRole("button", { name: "Botanical" }).click();
  await expect(page.getByRole("button", { name: "Botanical" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByLabel("Color by").selectOption("direction");
  await page.getByRole("button", { name: "Cycle colors", exact: true }).click();
  await page.getByLabel("Tile outlines").uncheck();
  await expect(page.getByLabel("Line weight")).toBeDisabled();
  await page.getByLabel("Tile color 1").fill("#112233");
  await expect(page.getByText("Custom", { exact: true })).toBeVisible();
  const canvas = page.locator("canvas");
  await expect(
    page.getByRole("button", { name: /Zoom in|Zoom out/ }),
  ).toHaveCount(0);
  await expect(canvas).not.toHaveAttribute("tabindex", "0");
  // Mouse, wheel, and former keyboard shortcuts must leave the fitted preview unchanged.
  await page.evaluate(() => window.scrollTo(0, 0));
  const before = await canvas.evaluate(async (element) => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    return (element as HTMLCanvasElement).toDataURL();
  });
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 60,
    box.y + box.height / 2 + 40,
    { steps: 5 },
  );
  await page.mouse.up();
  for (const key of ["+", "-", "ArrowRight", "ArrowDown", "0"])
    await canvas.dispatchEvent("keydown", { key });
  await page.mouse.wheel(0, 200);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);
  expect(
    await canvas.evaluate((element) =>
      (element as HTMLCanvasElement).toDataURL(),
    ),
  ).toBe(before);
  const downloadReady = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download SVG" }).click();
  const download = await downloadReady;
  const svg = await readFile((await download.path())!, "utf8");
  expect(svg).toContain("Jarkko Kari and Markus Rissanen");
  expect(svg).toContain("10.1007/s00454-016-9779-1");
  expect(svg).toContain("n7.3 S123 Lines 100.pdf");
  expect(svg).toContain('fill="#112233"');
  expect(svg).toContain('stroke="none"');
  expect(svg.match(/<polygon /g)).toHaveLength(2968);
  const parsed = await page.evaluate((xml) => {
    const doc = new DOMParser().parseFromString(xml, "image/svg+xml");
    return {
      errors: doc.querySelectorAll("parsererror").length,
      meta: JSON.parse(doc.querySelector("metadata")!.textContent!),
    };
  }, svg);
  expect(parsed.errors).toBe(0);
  expect(parsed.meta.view.rotation).toBe(0);
  expect(parsed.meta.view).not.toHaveProperty("pan");
  expect(parsed.meta.view).not.toHaveProperty("zoom");
  await page
    .getByRole("button", { name: "Jarkko Kari & Markus Rissanen" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open-access preprint" }),
  ).toHaveAttribute("href", "https://arxiv.org/abs/1512.01402");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Seed" }).click();
  await expect(page.getByText("14 RHOMBI", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Second" }).click();
  await expect(page.getByLabel("Field size")).toBeEnabled();
  await expect(page.getByText("GENERATING", { exact: true })).not.toBeVisible();
  await expect(page.getByText("BOUNDED FIELD", { exact: true })).toBeVisible();
  const initialCount = await page
    .locator(".preview-status [role=status]")
    .textContent();
  await page.getByLabel("Field size").focus();
  await page.keyboard.press("End");
  await expect(page.getByText("GENERATING", { exact: true })).not.toBeVisible();
  await expect(page.locator(".preview-status [role=status]")).not.toHaveText(
    initialCount!,
  );
  await expect(
    page.getByRole("button", { name: "Download SVG" }),
  ).toBeEnabled();
  await page.getByLabel("X offset").focus();
  await page.keyboard.press("End");
  await page.getByLabel("Y offset").focus();
  await page.keyboard.press("Home");
  await expect(
    page.getByRole("button", { name: "Download SVG" }),
  ).toBeEnabled();
  await expect(page.getByText("SOURCE GENERATION 3")).toBeVisible();
  const offsetDownloadReady = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download SVG" }).click();
  const offsetDownload = await offsetDownloadReady;
  const offsetSvg = await readFile((await offsetDownload.path())!, "utf8");
  const metadata = await page.evaluate(
    (xml) =>
      JSON.parse(
        new DOMParser()
          .parseFromString(xml, "image/svg+xml")
          .querySelector("metadata")!.textContent!,
      ),
    offsetSvg,
  );
  expect(metadata.offset).toEqual([1000, -1000]);
  expect(metadata.generation).toBe(3);
  await page.getByRole("button", { name: "First" }).click();
  await expect(page.getByText("2,968 RHOMBI")).toBeVisible();
  await page.getByRole("button", { name: "Earthen" }).click();
  await expect(page.getByRole("button", { name: "Earthen" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(errors).toEqual([]);
  for (const text of [
    "Drag to explore",
    "Scroll to zoom",
    "YOUR COMPOSITION",
    "Vector artwork · research credits included",
    "MATHEMATICS, IN PATTERN",
    "AN INTERACTIVE TILING STUDY",
    "EXACT GEOMETRY. ENDLESS EXPLORATION.",
    "A STUDY IN QUASIPERIODICITY",
  ]) {
    await expect(page.getByText(text, { exact: true })).toHaveCount(0);
  }
  await expect(
    page.getByRole("button", { name: "Reset", exact: true }),
  ).toHaveCount(0);
});

test("works on a narrow screen and renders without external network dependencies", async ({
  page,
  baseURL,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === new URL(baseURL!).origin
      ? route.continue()
      : route.abort(),
  );
  await page.goto("/");
  await expect(page.getByText("2,968 RHOMBI")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("sub rosa.");
  const cards = page
    .getByRole("region", { name: "The three prototiles" })
    .getByRole("article");
  const firstCard = (await cards.nth(0).boundingBox())!;
  const secondCard = (await cards.nth(1).boundingBox())!;
  expect(secondCard.y).toBeGreaterThanOrEqual(firstCard.y + firstCard.height);
  for (const svg of await cards.locator("svg").all()) {
    const bounds = (await svg.boundingBox())!;
    expect(bounds.width).toBeGreaterThan(200);
    expect(bounds.height).toBeGreaterThanOrEqual(190);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Nocturne" }).click();
  await expect(page.getByRole("button", { name: "Nocturne" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page
    .getByRole("button", { name: "Jarkko Kari & Markus Rissanen" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const bounds = await page.getByRole("dialog").boundingBox();
  expect(bounds!.width).toBeLessThan(390);
});


test("toggles first-generation guides independently and preserves them across fields", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("2,968 RHOMBI")).toBeVisible();
  const guides = page.getByLabel("First-generation outlines");
  const canvas = page.locator("canvas");
  const pixels = () => canvas.evaluate((el) => (el as HTMLCanvasElement).toDataURL());
  await page.getByLabel("Tile outlines").uncheck();
  await expect(page.getByLabel("Outline", { exact: true })).toBeDisabled();
  const before = await pixels();
  await guides.check();
  await expect(page.getByLabel("Outline", { exact: true })).toBeEnabled();
  await expect.poll(pixels).not.toBe(before);
  await expect(page.getByText("GENERATING", { exact: true })).not.toBeVisible();
  const ready = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download SVG" }).click();
  const svg = await readFile((await (await ready).path())!, "utf8");
  const exported = await page.evaluate((xml) => {
    const doc = new DOMParser().parseFromString(xml, "image/svg+xml");
    const layer = doc.querySelector('[data-layer="super-rhombi"]')!;
    return { errors: doc.querySelectorAll("parsererror").length,
      count: layer.getAttribute("d")!.split("M").length - 1,
      clip: layer.getAttribute("clip-path") };
  }, svg);
  expect(exported).toEqual({ errors: 0, count: 14, clip: "url(#patch-clip)" });
  await guides.uncheck();
  await expect.poll(pixels).toBe(before);
  await guides.check();
  await page.getByRole("button", { name: "Seed", exact: false }).click();
  await expect(page.getByText("14 RHOMBI", { exact: true })).toBeVisible();
  await expect(guides).toBeDisabled();
  await page.getByRole("button", { name: "Second", exact: false }).click();
  await expect(page.getByRole("button", { name: "Download SVG" })).toBeEnabled();
  await expect(guides).toBeEnabled();
  await expect(guides).toBeChecked();
  await page.getByLabel("X offset").focus();
  await page.keyboard.press("End");
  await expect(page.getByText("SOURCE GENERATION 3")).toBeVisible();
  await expect(page.getByRole("button", { name: "Download SVG" })).toBeEnabled();
  const offsetBefore = await pixels();
  await guides.uncheck();
  await expect.poll(pixels).not.toBe(offsetBefore);
});
