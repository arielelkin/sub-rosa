// Intent: Run geometry, provenance, and export contracts without starting a browser.
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["test/*.test.ts"] } });
