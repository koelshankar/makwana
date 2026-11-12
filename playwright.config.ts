import { defineConfig } from "@playwright/test";

// End-to-end tests against the production build (`next start`), in the installed Google Chrome
// only, at the two demo laptop sizes. `npm run e2e` builds first.
const PORT = 3100;

// The real GPU (ANGLE Metal on the Mac), as on the demo laptop. SwiftShader software WebGL logs
// "GPU stall due to ReadPixels" driver warnings, which would trip the console guard.
const chrome = { browserName: "chromium" as const, channel: "chrome" };

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chrome-1366x768", use: { ...chrome, viewport: { width: 1366, height: 768 } } },
    { name: "chrome-1440x900", use: { ...chrome, viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/setup`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
