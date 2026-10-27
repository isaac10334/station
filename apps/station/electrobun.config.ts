import type { ElectrobunConfig } from "electrobun";
import { desktopProfile } from "./desktop/profile";

// Opt-in packaged A/B tests only. Public builds retain the fixed canary URL.
const testFeed = process.env.STATION_DESKTOP_TEST_FEED;
const development = process.env.STATION_DESKTOP_DEV === "1";
const profile = desktopProfile(process.env.STATION_DESKTOP_ACCEPTANCE === "1", development);
if (testFeed && process.env.STATION_DESKTOP_ACCEPTANCE !== "1")
  throw new Error("Test update feeds require STATION_DESKTOP_ACCEPTANCE=1.");
if (testFeed && !/^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(testFeed))
  throw new Error(
    "STATION_DESKTOP_TEST_FEED must be a loopback HTTP origin with an explicit port",
  );

export default {
  app: {
    name: "Station",
    identifier: profile.identifier,
    version: process.env.STATION_VERSION ?? "0.1.0-canary.0",
  },
  build: {
    watch: ["desktop", "server", "src/contracts", "src/core", "src/features"],
    watchIgnore: ["src/ui/**", "src/generated/**", "dist/**"],
    win: { icon: "../../packages/ui/assets/station.ico" },
    mainProcess: "bun",
    bun: { entrypoint: "desktop/main.ts" },
    copy: {
      ...(!development ? { "dist/index.html": "station/index.html" } : {}),
      "dist/desktop": "station/runtime",
    },
  },
  runtime: { exitOnLastWindowClosed: true },
  scripts: { postBuild: "./scripts/install-browser-native.ts" },
  release: {
    baseUrl:
      process.env.STATION_DESKTOP_ACCEPTANCE === "1"
        ? (testFeed ?? "http://127.0.0.1:49158")
        : "https://github.com/isaac10334/station/releases/download/canary",
  },
} satisfies ElectrobunConfig;
