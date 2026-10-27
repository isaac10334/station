/** Opt-in integration acceptance. Temporarily edits one upstream export and restores its exact bytes. */
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { root, localLoop, run, links } from "./local-loop";
const checkout = resolve(
  process.argv[2] ??
    (() => {
      throw new Error("Pass the Loop Kit checkout");
    })(),
);
const source = join(checkout, "packages/scripting/src/index.ts");
const original = new Uint8Array(await readFile(source));
const protectedFiles = [
  "package.json",
  "bun.lock",
  "apps/station/package.json",
];
const hashes = await Promise.all(
  protectedFiles.map(async (file) =>
    createHash("sha256")
      .update(new Uint8Array(await readFile(join(root, file))))
      .digest("hex"),
  ),
);
let watcher: ReturnType<typeof Bun.spawn> | undefined;
const token = "station-link-" + crypto.randomUUID();
try {
  await localLoop("on", checkout);
  if (links().some((item) => !item.linked))
    throw new Error("A nested workspace link still resolves installed archives");
  await writeFile(source, Buffer.concat([original,Buffer.from('\n// stale-output rejection fixture\n')]));
  let staleRejected=false;
  try {links();} catch(error) {staleRejected=String(error).includes('Stale linked build');}
  if(!staleRejected)throw new Error('Stale linked output was accepted');
  console.log('Rejected stale linked output before rebuilding.');
  const watchLog=join(tmpdir(),token+'.log');
  watcher = Bun.spawn(
    ['bun','tooling/repo.ts','link','watch'],
    {
      cwd: root,
      stdout: Bun.file(watchLog),
      stderr: "inherit",
    },
  );
  const startup=Date.now()+30000;
  while(!await Bun.file(watchLog).text().then(text=>text.includes('Watching all Loop Kit sources'))) {
    if(Date.now()>startup)throw new Error('Link watcher did not start');
    await Bun.sleep(100);
  }
  await writeFile(
    source,
    new Uint8Array([
      ...original,
      ...new TextEncoder().encode(
        `\nexport const __stationLocalLinkProof = ${JSON.stringify(token)};\n`,
      ),
    ]),
  );
  const deadline = Date.now() + 30000;
  while (
    !(
      await Bun.file(join(checkout, "packages/scripting/dist/index.js")).text()
    ).includes(token)
  ) {
    if (Date.now() > deadline)
      throw new Error("Watch did not rebuild the linked source");
    await Bun.sleep(100);
  }
  await run(
    [
      "bun",
      "-e",
      `import {__stationLocalLinkProof as proof} from '@loop-kit/scripting';if(proof!==${JSON.stringify(token)})throw new Error('Stale linked consumer');console.log(proof);`,
    ],
    join(root, "apps/station"),
  );
  if (
    !(
      await Bun.file(
        join(checkout, "packages/scripting/dist/index.d.ts"),
      ).text()
    ).includes(token)
  )
    throw new Error("Watch did not update types");
  await run(
    ["bun", "scripts/prepare-web-tools.ts"],
    join(root, "apps/station"),
  );
  if (
    !(
      await Bun.file(
        join(root, "apps/station/src/generated/program-resources.ts"),
      ).text()
    ).includes(token)
  )
    throw new Error("Guest compiler embedded stale installed output");
  const production = Bun.spawnSync(
    ["bun", "tooling/repo.ts", "assert-reproducible"],
    { cwd: root, stdout: "pipe", stderr: "pipe" },
  );
  if (production.exitCode === 0)
    throw new Error("Production accepted local links");
  console.log(
    "Passed: upstream edit -> watch JS/types -> Station public import -> embedded guest SDK; production rejected links.",
  );
} finally {
  if (watcher) {
    watcher.kill();
    await watcher.exited;
  }
  await writeFile(source, original);
  await run(["bun", "run", "build"], join(checkout, "packages/scripting"));
  await localLoop("off");
  await run(
    ["bun", "scripts/prepare-web-tools.ts"],
    join(root, "apps/station"),
  );
  const after = await Promise.all(
    protectedFiles.map(async (file) =>
      createHash("sha256")
        .update(new Uint8Array(await readFile(join(root, file))))
        .digest("hex"),
    ),
  );
  if (JSON.stringify(after) !== JSON.stringify(hashes))
    throw new Error("Link proof changed a manifest or lockfile");
  console.log(
    "Restored exact upstream bytes and normal package resolution; manifests/lockfile unchanged.",
  );
}
