import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Station",
    identifier: "com.isaacharvey.station",
    version: process.env.STATION_VERSION ?? "0.1.0-canary.0",
  },
  build: {
    mainProcess: "bun",
    bun: { entrypoint: "desktop/main.ts" },
    copy: {
      "dist/index.html": "station/index.html",
      "dist/desktop": "station/runtime",
    },
  },
  runtime: { exitOnLastWindowClosed: true },
  release: {
    baseUrl: "https://github.com/isaac10334/station/releases/download/canary",
  },
} satisfies ElectrobunConfig;
