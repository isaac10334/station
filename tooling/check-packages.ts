/** Pack public packages and verify exports/types in a clean consumer, without publishing. */
import { mkdtemp, mkdir, writeFile, readdir, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { assertReproducible, root, run, loopNames } from "./local-loop";
assertReproducible();
const scratch = await mkdtemp(join(tmpdir(), "station-pack-"));
const output = join(scratch, "tarballs");
await mkdir(output);
const locations = [
  "packages/capabilities",
  "packages/sdk",
];
const names: string[] = loopNames.map(name=>'@loop-kit/'+name);
const rootManifest=await Bun.file(join(root,'package.json')).json();
for(const name of loopNames) {
  const specifier=rootManifest.overrides?.['@loop-kit/'+name];
  if(specifier?.startsWith('file:')) {
    const source=resolve(root,specifier.slice(5));
    await copyFile(source,join(output,source.split(/[\\/]/).at(-1)!));
  }
}
for (const location of locations) {
  const manifest = await Bun.file(join(root, location, "package.json")).json();
  names.push(manifest.name);
  await run(
    ["bun", "pm", "pack", "--destination", output],
    join(root, location),
  );
}
const archives = await readdir(output);
const dependencies = Object.fromEntries(
  names.map((name) => {
    const archive = archives.find((file) =>
      file.startsWith(name.replace("@", "").replace("/", "-") + "-"),
    );
    if (!archive) {
      if(name.startsWith('@loop-kit/'))return [name,rootManifest.devDependencies[name]];
      throw new Error(`Missing tarball for ${name}`);
    }
    return [name, "file:" + join(output, archive).replaceAll("\\", "/")];
  }),
);
await writeFile(
  join(scratch, "package.json"),
  JSON.stringify({
    private: true,
    type: "module",
    dependencies,
    overrides: dependencies,
  }),
);
await writeFile(
  join(scratch, "consumer.ts"),
  `import {connect, assetMetadata} from '@station/sdk';
import {defineCapability} from '@loop-kit/capabilities';
import {createHost} from '@loop-kit/host';
if(typeof connect!=='function'||typeof defineCapability!=='function'||typeof createHost!=='function'||assetMetadata.id!=='station:assets/metadata')throw new Error('Public entrypoint broken');
for(const name of ['@station/sdk/src/index.ts','@station/capabilities/src/index.ts','@loop-kit/host/src/index.ts']) {
 let rejected=false;try{await import(name);}catch{rejected=true;}if(!rejected)throw new Error('Private import accepted: '+name);
}
console.log('Packed public entrypoints and private import rejection passed');`,
);
await writeFile(
  join(scratch, "tsconfig.json"),
  JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      strict: true,
      noEmit: true,
      skipLibCheck: false,
      types: [],
      lib: ["ES2022", "DOM"],
    },
    files: ["consumer.ts"],
  }),
);
await run(["bun", "install"], scratch);
await run(
  [
    "bun",
    resolve(root, "node_modules/typescript/bin/tsc"),
    "-p",
    "tsconfig.json",
  ],
  scratch,
);
await run(["bun", "consumer.ts"], scratch);
console.log(JSON.stringify({ consumer: scratch, packages: names }));
