/** Dedicated local development origin. Opt-in scoped broker; no credential or task
 * is created until reviewed in Station. Canary ports are never used or stopped. */
export {};
const port = Number(process.env.PORT ?? 3012);
if (
  !Number.isInteger(port) ||
  port < 1024 ||
  port > 65535 ||
  [43157, 43158].includes(port)
)
  throw new Error(
    "Choose a development PORT from 1024–65535, excluding desktop ports 43157/43158.",
  );
process.env.PORT = String(port);
process.env.STATION_HOST = "127.0.0.1";
process.env.STATION_AGENT_CONTROL = "1";
console.info(
  `Agent development: http://127.0.0.1:${port}\nPair in Desk settings → Agents; then inspect commands.list and state.inspect.\nEach browser tab has its own renderer ID. Account login does not grant control.`,
);
await import("../server/server");
