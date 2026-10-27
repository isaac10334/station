/** Explicit-target CLI / stdio MCP. Credentials never go to stdout or URLs. */
import { createInterface } from "node:readline";
import {
  headlessBackend,
  liveBackend,
  saveCredential,
} from "./control-backends";
import { requestSchema, z } from "@station/protocol";
const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args[i + 1];
};
const send = (value: unknown) =>
  process.stdout.write(`${JSON.stringify(value)}\n`);
if (args.includes("--discover") || args.includes("--pair")) {
  const target = new URL(option("--instance") ?? "");
  if (target.protocol !== "http:" || target.hostname !== "127.0.0.1")
    throw new Error("Explicit loopback --instance URL required");
  if (args.includes("--discover")) {
    const response = await fetch(`${target.origin}/api/control/discover`);
    if (!response.ok) throw new Error(`Agent control unavailable at ${target.origin} (HTTP ${response.status}). Start bun run dev:agent for an isolated localhost development origin; do not switch to a desktop instance implicitly.`);
    send(
      await response.json(),
    );
  } else {
    const directory = option("--credential-dir"),
      code = process.env.STATION_PAIR_SECRET;
    if (!directory || !code)
      throw new Error(
        "Use --credential-dir and STATION_PAIR_SECRET from trusted Station UI",
      );
    delete process.env.STATION_PAIR_SECRET;
    const response = await fetch(`${target.origin}/api/control/pair`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        name: option("--name") ?? "Codex (self-reported)",
      }),
    });
    const credential = await response.json();
    if (!response.ok) throw new Error(credential.error);
    const path = await saveCredential(directory, credential);
    send({
      credentialFile: path,
      instanceId: credential.instanceId,
      rendererId: credential.rendererId,
    });
  }
} else {
  const backend = option("--connect")
    ? await liveBackend(option("--connect")!)
    : option("--state")
      ? await headlessBackend(option("--state")!, option("--authorize") ?? "")
      : null;
  if (!backend)
    throw new Error(
      "Use --connect <paired-credential.json> or --state <isolated-profile.json> --authorize <task-fixture.json>",
    );
  if (args.includes("--mcp")) {
    const { createControlMcp } = await import("./control-mcp");
    const { StdioServerTransport } =
      await import("@modelcontextprotocol/server/stdio");
    const server = await createControlMcp(backend);
    const transport = new StdioServerTransport();
    transport.onclose = () => {
      void backend.close();
    };
    await server.connect(transport);
    process.stdin.once("end", () => {
      void backend.close();
    });
  } else
    try {
      if (option("--method"))
        send(
          await backend.execute(
            requestSchema.parse({
              method: option("--method"),
              params: option("--params") ? JSON.parse(option("--params")!) : {},
              ...(option("--version")
                ? { version: JSON.parse(option("--version")!) }
                : {}),
              requestId: option("--request-id") ?? crypto.randomUUID(),
            }),
          ),
        );
      else
        for await (const line of createInterface({
          input: process.stdin,
          crlfDelay: Infinity,
        })) {
          if (!line.trim()) continue;
          let id: string | number | null = null;
          let notification = false,
            invalidEnvelope = true;
          try {
            if (line.length > 1200000) throw new Error("Request too large");
            const input = JSON.parse(line);
            if (
              !input ||
              typeof input !== "object" ||
              Array.isArray(input) ||
              (input.jsonrpc !== undefined && input.jsonrpc !== "2.0") ||
              typeof input.method !== "string" ||
              (input.id !== undefined &&
                input.id !== null &&
                typeof input.id !== "string" &&
                typeof input.id !== "number")
            )
              throw new Error("Invalid JSON-RPC request envelope");
            id = input.id ?? null;
            notification = input.jsonrpc === "2.0" && input.id === undefined;
            const { id: _, jsonrpc, ...request } = input;
            const parsed = requestSchema.parse(request);
            invalidEnvelope = false;
            const result = await backend.execute(parsed);
            if (!notification)
              send({
                jsonrpc: "2.0",
                id,
                result,
              });
          } catch (error) {
            if (!notification)
              send({
                jsonrpc: "2.0",
                id,
                error: {
                  code:
                    error instanceof SyntaxError
                      ? -32700
                      : invalidEnvelope
                        ? -32600
                        : (error as any).code === "unknown_command"
                          ? -32601
                          : error instanceof z.ZodError
                            ? -32602
                            : -32000,
                  message:
                    error instanceof Error ? error.message : "Invalid request",
                  data: { code: (error as any).code ?? "invalid_request" },
                },
              });
          }
        }
    } finally {
      await backend.close();
    }
}
