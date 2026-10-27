/** Explicit storage/credential adapters. Never discover or clone a live profile. */
import {
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  writeFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { resolve, dirname, join } from "node:path";
import { createComposition } from "../src/application";
import { taskScopeSchema, type CommandRequest } from "@station/protocol";
import { headlessComponents } from "../server/headless-component";
export interface ControlBackend {
  execute(request: CommandRequest): Promise<any>;
  close(): Promise<void>;
}
export async function liveBackend(filename: string): Promise<ControlBackend> {
  const credential = await Bun.file(resolve(filename)).json(),
    url = new URL(credential.url);
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    !credential.instanceId ||
    !credential.rendererId ||
    !credential.credential
  )
    throw new Error("Explicit local paired credential file required");
  return {
    async execute(request) {
      const response = await fetch(`${url.origin}/api/control/execute`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credential.credential}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          instanceId: credential.instanceId,
          rendererId: credential.rendererId,
          request,
        }),
        signal: AbortSignal.timeout(7000),
      });
      const value = await response.json();
      if (!response.ok || value.ok === false)
        throw Object.assign(
          new Error(
            value.error?.message ?? value.error ?? "Control unavailable",
          ),
          { code: value.error?.code ?? "transport_error" },
        );
      return value;
    },
    async close() {},
  };
}
export async function headlessBackend(
  filename: string,
  authorizationFile: string,
): Promise<ControlBackend> {
  if (!authorizationFile)
    throw new Error(
      "Headless mode requires --authorize <explicit-task-fixture.json>",
    );
  const fixture = await Bun.file(resolve(authorizationFile)).json(),
    scope = taskScopeSchema.parse(fixture.scope);
  const path = resolve(filename);
  mkdirSync(dirname(path), { recursive: true });
  const lock = openSync(`${path}.lock`, "wx", 0o600);
  try {
    const values = (await Bun.file(path).exists())
      ? JSON.parse(readFileSync(path, "utf8"))
      : {};
    const storage = {
      getItem: (key: string) => values[key] ?? null,
      setItem: (key: string, value: string) => {
        values[key] = value;
        writeFileSync(`${path}.tmp`, JSON.stringify(values), { mode: 0o600 });
        renameSync(`${path}.tmp`, path);
      },
    };
    const components = headlessComponents(path, () => app.store);
    const app = createComposition(storage, components.createRunner, {
      buildComponent: components.build,
    });
    if (fixture.workspaceId && fixture.workspaceId !== app.store.active().id)
      throw new Error("Authorization fixture workspace mismatch");
    const context = app.control.issueTask({
      name: fixture.name ?? "Isolated task",
      workspaceId: app.store.active().id,
      scope,
      source: "fixture",
    });
    let closed = false;
    return {
      async execute(request) {
        return app.control.executeFor(context, request);
      },
      async close() {
        if (closed) return;
        closed = true;
        await app.dispose();
        closeSync(lock);
        rmSync(`${path}.lock`, { force: true });
      },
    };
  } catch (error) {
    closeSync(lock);
    rmSync(`${path}.lock`, { force: true });
    throw error;
  }
}
export { saveCredential } from "../server/control-credentials";
