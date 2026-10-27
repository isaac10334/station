import { test, expect } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
test("real stdio MCP client discovers, authors, reads, builds and enforces denial", async () => {
  const dir = await mkdtemp(join(tmpdir(), "station-command-test-"));
  const fixture = join(dir, "authorization.json");
  await writeFile(
    fixture,
    JSON.stringify({
      name: "MCP acceptance",
      scope: {
        operations: [
          "state.inspect",
          "assets.list",
          "asset.create",
          "asset.read",
          "web.build",
        ],
        create: true,
      },
    }),
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      join(import.meta.dir, "../scripts/station-control.ts"),
      "--mcp",
      "--state",
      join(dir, "profile.json"),
      "--authorize",
      fixture,
    ],
    stderr: "pipe",
  });
  const client = new Client({ name: "station-acceptance", version: "1.0.0" });
  try {
    await client.connect(transport);
    expect(
      (await client.listTools()).tools.some(
        (t) => t.name === "station_asset_create",
      ),
    ).toBe(true);
    const state = await client.callTool({
      name: "station_state_inspect",
      arguments: {},
    });
    const version = (state.structuredContent as any).version;
    const created = await client.callTool({
      name: "station_asset_create",
      arguments: {
        params: {
          name: "MCP widget",
          kind: "web-content",
          files: {
            "index.html":
              '<div id="app"></div><script type="module" src="src/main.ts"></script>',
            "src/main.ts":
              'import {connect} from "@station/sdk"; void connect(); document.querySelector("#app")!.textContent="Runtime authored";',
          },
        },
        version,
      },
    });
    expect(created.isError).not.toBe(true);
    const asset = (created.structuredContent as any).result;
    const read = await client.callTool({
      name: "station_asset_read",
      arguments: { params: { assetId: asset.id } },
    });
    expect(JSON.stringify(read)).toContain("Runtime authored");
    const denied = await client.callTool({
      name: "station_asset_read",
      arguments: { params: { assetId: "greeting" } },
    });
    expect(denied.isError).toBe(true);
    const build = await client.callTool({
      name: "station_web_build",
      arguments: {
        params: { assetId: asset.id },
        version: (created.structuredContent as any).version,
      },
    });
    expect(build.isError).not.toBe(true);
    const operationId = (build.structuredContent as any).result.operationId;
    let status: any;
    for (let i = 0; i < 100; i++) {
      status = (
        await client.callTool({
          name: "station_operations_inspect",
          arguments: { params: { operationId } },
        })
      ).structuredContent;
      if (status?.result.status !== "running") break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(status?.result.status, JSON.stringify(status)).toBe("succeeded");
    expect(status.result.result.documentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(
      (await client.readResource({ uri: "station://state" })).contents,
    ).toHaveLength(1);
  } finally {
    await client.close();
  }
}, 20000);
