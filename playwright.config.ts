// Intent: Exercise real worker, canvas controls, downloads, and responsive layouts against a production build.
import { defineConfig, devices } from "@playwright/test";
import { execFileSync } from "node:child_process";

// Resolve the host's mise-managed Chrome instead of downloading a test-only browser.
const executablePath =
  process.env.PLAYWRIGHT_MCP_EXECUTABLE_PATH ||
  execFileSync("mise", ["which", "chrome"], { encoding: "utf8" }).trim();
const port = Number(process.env.SUBROSA_E2E_PORT ?? 5187);
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: "./test/e2e",
  timeout: 60_000,
  fullyParallel: true,
  use: {
    baseURL,
    trace: "retain-on-failure",
    launchOptions: { executablePath },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1100 },
      },
    },
  ],
  webServer: {
    command: `npm run preview -- --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
  },
});
