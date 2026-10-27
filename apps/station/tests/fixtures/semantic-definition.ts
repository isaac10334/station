import type { UiFrame } from "@loop-kit/ui";
export const semanticProofFrame: UiFrame = {
  revision: 0,
  root: {
    key: "proof",
    type: "column",
    children: [
      { key: "heading", type: "text", text: "Semantic proof" },
      {
        key: "run",
        type: "button",
        label: "Run proof",
        text: "Run",
        icon: { kind: "symbol", name: "Play" },
      },
      { key: "name", type: "input", label: "Name", value: "Station" },
      {
        key: "rows",
        type: "list",
        label: "Machines",
        value: "local",
        children: [
          { key: "local", type: "text", text: "Local machine" },
          { key: "remote", type: "text", text: "Remote machine" },
        ],
      },
    ],
  },
};
