import { defineConfig } from "@trigger.dev/sdk/v3";

export const config = defineConfig({
  project: "myaircraft-us",
  runtime: "node",
  logLevel: "log",
  retries: {
    enabledInDev: true,
    default: { maxAttempts: 3, minTimeoutInMs: 1000, maxTimeoutInMs: 10000, factor: 2 },
  },
  dirs: ["./trigger/jobs"],
});
