/** Prove a portable frozen install and Loop imports without access to the local checkout. */
import { mkdtemp, mkdir, copyFile, cp, writeFile, rename, readFile } from 'node:fs/promises';
import { readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { root, run } from './local-loop';
const scratch=await mkdtemp(join(tmpdir(),'station-clean-loop-'));
for(const file of ['package.json','bun.lock','bunfig.toml'])await copyFile(join(root,file),join(scratch,file));
for(const directory of ['apps','packages'])for(const item of readdirSync(join(root,directory))) {
  const manifest=join(root,directory,item,'package.json');if(!existsSync(manifest))continue;
  await mkdir(join(scratch,directory,item),{recursive:true});await copyFile(manifest,join(scratch,directory,item,'package.json'));
}
await cp(join(root,'artifacts/loop-kit'),join(scratch,'artifacts/loop-kit'),{recursive:true});
await mkdir(join(scratch,'tooling'));
for(const file of ['local-loop.ts'])await copyFile(join(root,'tooling',file),join(scratch,'tooling',file));
await writeFile(join(scratch,'proof.ts'),`import {assertReproducible,links} from './tooling/local-loop';import {createHost} from '@loop-kit/host';import {defineCapability} from '@loop-kit/capabilities';import {RecordingSurface} from '@loop-kit/ui';import {createGuestSdk} from '@loop-kit/scripting';assertReproducible();if(![createHost,defineCapability,RecordingSurface,createGuestSdk].every(value=>typeof value==='function'))throw new Error('Broken install');console.log(JSON.stringify({clean:true,resolutions:links()}));`);
await run(['bun','install','--frozen-lockfile','--cache-dir',join(scratch,'empty-cache')],scratch);
await run(['bun','proof.ts'],scratch);
function rejects(reason:string) {
  const child=Bun.spawnSync(['bun','proof.ts'],{cwd:scratch,stdout:'pipe',stderr:'pipe'});
  if(!child.exitCode||!new TextDecoder().decode(child.stderr).includes(reason))throw new Error(`Missing rejection: ${reason}`);
  console.log(`Rejected: ${reason}`);
}
const duplicate=join(scratch,'apps/station/node_modules/@loop-kit/capabilities');
await mkdir(join(duplicate,'..'),{recursive:true});
await cp(join(scratch,'node_modules/@loop-kit/capabilities'),duplicate,{recursive:true});
rejects('Duplicate or missing package');
await rename(duplicate,join(scratch,'duplicate-fixture'));
const entry=join(scratch,'node_modules/@loop-kit/host/dist/index.js'),original=await readFile(entry);
try {await writeFile(entry,Buffer.concat([original,Buffer.from('\n// stale installed bytes\n')]));rejects('Stale or modified installed package');}
finally {await writeFile(entry,original);}
await run(['bun','proof.ts'],scratch);
console.log(JSON.stringify({cleanInstall:scratch,externalCheckoutRequired:false}));
