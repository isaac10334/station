import { HOST_CLOCK, HOST_FEED, HOST_LOG, HOST_SURFACE } from "./component-contract";

/** Current worker import membrane. WIT grants are distinct from built-in JS provider registration. */
export const COMPONENT_GRANTS = [
  { key: HOST_LOG, label: "Host logging", hint: "Append up to 100 bounded messages to this run’s log." },
  { key: HOST_FEED, label: "Async input feed", hint: "Supply an input stream and future, up to 64 KiB." },
  { key: HOST_SURFACE, label: "Text surface", hint: "Write up to 4,096 characters of plain text." },
  { key: HOST_CLOCK, label: "P3 monotonic clock", hint: "Read monotonic time in the Component worker." },
] as const;
