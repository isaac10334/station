/** Reversible Bun development links; committed dependency declarations never change. */
import { existsSync, readFileSync, realpathSync, lstatSync, unlinkSync, readdirSync, symlinkSync, mkdirSync, statSync, renameSync } from 'node:fs';
import { join, resolve, relative, sep, isAbsolute, dirname } from 'node:path';
import { createHash } from 'node:crypto';
export const loopNames = ['capabilities','host','ui','scripting'];
export const root = resolve(import.meta.dir,'..');
export async function run(args: string[], cwd = root) {
  const child=Bun.spawn(args,{cwd,stdout:'inherit',stderr:'inherit'});
  if(await child.exited) throw new Error(`Failed: ${args.join(' ')}`);
}
function workspaces() {
  return [root,...['apps','packages'].flatMap(directory=>readdirSync(join(root,directory),{withFileTypes:true})
    .filter(item=>item.isDirectory()&&existsSync(join(root,directory,item.name,'package.json'))).map(item=>join(root,directory,item.name)))];
}
function freshResolution(name:string,from:string) {
  // Bun's resolver caches symlink targets within a process; unlink verification
  // must observe the filesystem after installation, not that cached resolution.
  const child=Bun.spawnSync(['bun','-e',`console.log(Bun.resolveSync(${JSON.stringify(name)},${JSON.stringify(from)}))`],{stdout:'pipe',stderr:'pipe'});
  if(child.exitCode)throw new Error(new TextDecoder().decode(child.stderr));
  const entrypoint=realpathSync(new TextDecoder().decode(child.stdout).trim());
  let actual=dirname(entrypoint);
  while(dirname(actual)!==actual) {
    const manifest=join(actual,'package.json');
    if(existsSync(manifest)&&JSON.parse(readFileSync(manifest,'utf8')).name===name)return {actual,entrypoint};
    actual=dirname(actual);
  }
  throw new Error(`Missing owning package ${name}`);
}
/** Resolve every consumer and Loop dependency, rejecting divergent copies and missing builds. */
export function links(allowStale = false) {
  const entries: {name:string;path:string;actual:string;entrypoint:string;linked:boolean}[]=[];
  for(const from of workspaces()) {
    const manifest=JSON.parse(readFileSync(join(from,'package.json'),'utf8'));
    for(const name of loopNames.map(name=>'@loop-kit/'+name)) {
      if(!{...manifest.dependencies,...manifest.devDependencies,...manifest.peerDependencies}[name])continue;
      const {actual,entrypoint}=freshResolution(name,from);
      entries.push({name,path:from,actual,entrypoint,linked:!inside(join(root,'node_modules'),actual)});
    }
  }
  for(const name of loopNames.map(name=>'@loop-kit/'+name)) {
    const roots=new Set(entries.filter(item=>item.name===name).map(item=>item.actual));
    if(roots.size!==1)throw new Error(`Duplicate or missing package ${name}: ${[...roots].join(', ')}`);
    const actual=[...roots][0]!;
    const manifest=JSON.parse(readFileSync(join(actual,'package.json'),'utf8'));
    if(!manifest.exports?.['.']?.types||!existsSync(join(actual,manifest.exports['.'].types)))throw new Error(`Missing declarations: ${name}`);
    if(!inside(join(root,'node_modules'),actual)) {
      const emitted=statSync(join(actual,manifest.exports['.'].import)).mtimeMs;
      const visit=(directory:string):boolean=>readdirSync(directory,{withFileTypes:true}).some(item=>item.isDirectory()?visit(join(directory,item.name)):item.name.endsWith('.ts')&&statSync(join(directory,item.name)).mtimeMs>emitted+10);
      if(!allowStale&&existsSync(join(actual,'src'))&&visit(join(actual,'src')))throw new Error(`Stale linked build for ${name}; rebuild Loop Kit or run link watch`);
    } else {
      const receipt=join(root,'artifacts/loop-kit/installed-files.json');
      if(existsSync(receipt))for(const [path,hash] of Object.entries(JSON.parse(readFileSync(receipt,'utf8'))[name]??{})) {
        const file=join(actual,path);
        if(!existsSync(file)||createHash('sha256').update(new Uint8Array(readFileSync(file))).digest('hex')!==hash)throw new Error(`Stale or modified installed package: ${name}/${path}. Reinstall the frozen dependencies.`);
      }
    }
    for(const dep of Object.keys(manifest.dependencies??{}).filter(dep=>dep.startsWith('@loop-kit/'))) {
      const depRoot=freshResolution(dep,actual).actual;
      if(!entries.some(item=>item.name===dep&&item.actual===depRoot))throw new Error(`Duplicate transitive dependency ${name} -> ${dep}: ${depRoot}`);
    }
  }
  return entries;
}
function inside(parent:string,path:string) {const child=relative(parent,path);return child===''||(!child.startsWith('..'+sep)&&child!=='..'&&!isAbsolute(child));}
export function assertReproducible() {
  if(links().some(item=>item.linked))throw new Error('Production rejects development links. Run bun run repo link off.');
  const integrity=join(root,'artifacts/loop-kit/integrity.json');
  if(existsSync(integrity))for(const [file,hash] of Object.entries(JSON.parse(readFileSync(integrity,'utf8')))) {
    if(createHash('sha256').update(new Uint8Array(readFileSync(join(root,'artifacts/loop-kit',file)))).digest('hex')!==hash)throw new Error(`Corrupt bootstrap artifact ${file}`);
  }
}
function slots() {
  return workspaces().flatMap(from=>loopNames.map(name=>join(from,'node_modules/@loop-kit',name))).filter(path=>{
    try{return lstatSync(path).isSymbolicLink();}catch{return false;}
  });
}
function protectedBytes() {
  return [...workspaces().map(from=>join(from,'package.json')),join(root,'bun.lock')].map(path=>({path,bytes:readFileSync(path)}));
}
function restoreInstalled() {
  for(const name of loopNames) {
    const backup=join(root,'node_modules/.station-loop-installed',name),slot=join(root,'node_modules/@loop-kit',name);
    if(!existsSync(backup))continue;
    try {if(lstatSync(slot).isSymbolicLink())unlinkSync(slot);else throw new Error(`Refusing to replace real directory ${slot}`);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    renameSync(backup,slot);
  }
}
export async function localLoop(action:string,checkout?:string) {
  if(action==='status')return links();
  const protectedFiles=protectedBytes();
  try {
    if(action==='on') {
      if(!checkout)throw new Error('Usage: repo link on <checkout>');
      const upstream=realpathSync(resolve(checkout));
      for(const name of loopNames)if(JSON.parse(readFileSync(join(upstream,'packages',name,'package.json'),'utf8')).name!=='@loop-kit/'+name)throw new Error(`Unexpected package ${name}`);
      await run(['bun','run','build'],upstream);
      restoreInstalled();
      for(const name of loopNames)await run(['bun','link'],join(upstream,'packages',name));
      for(const path of slots())if(!inside(join(root,'node_modules'),realpathSync(path)))unlinkSync(path);
      await run(['bun','link','--no-save',...loopNames.map(name=>'@loop-kit/'+name)]);
      // Bun 1.3 prioritizes root overrides over link requests. Keep the portable
      // prepublication overrides and explicitly select the registered checkout.
      for(const name of loopNames) {
        const slot=join(root,'node_modules/@loop-kit',name);
        if(existsSync(slot)) {
          if(lstatSync(slot).isSymbolicLink())unlinkSync(slot);
          else {
            const backup=join(root,'node_modules/.station-loop-installed',name);
            if(existsSync(backup))throw new Error(`Review existing backup ${backup}`);
            mkdirSync(join(root,'node_modules/.station-loop-installed'),{recursive:true});
            // Both fixed paths are inside node_modules; preserve installed bytes
            // for unlink/rollback rather than deleting a real directory.
            if(!inside(join(root,'node_modules'),slot)||!inside(join(root,'node_modules'),backup))throw new Error('Invalid backup path');
            renameSync(slot,backup);
          }
        }
        mkdirSync(join(root,'node_modules/@loop-kit'),{recursive:true});
        symlinkSync(join(upstream,'packages',name),slot,'junction');
      }
      for(const path of slots())if(!path.startsWith(join(root,'node_modules')+sep))unlinkSync(path);
      const report=links();
      if(report.some(item=>item.actual!==realpathSync(join(upstream,'packages',item.name.split('/')[1]!))))throw new Error('Bun did not link the requested checkout');
    } else if(action==='off') {
      for(const path of slots())unlinkSync(path);
      restoreInstalled();
      await run(['bun','install','--frozen-lockfile']);
      assertReproducible();
    } else if(action==='watch') {
      const report=links(true);if(report.some(item=>!item.linked))throw new Error('Enable all links first');
      const child=Bun.spawn(['bun','run','watch'],{cwd:resolve(report[0]!.actual,'../..'),stdout:'inherit',stderr:'inherit'});
      const stop=()=>child.kill();process.once('SIGINT',stop);process.once('SIGTERM',stop);
      try {if(await child.exited)throw new Error('Loop watch stopped with errors');}
      finally {stop();process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
    } else throw new Error('Usage: repo link on <checkout>|off|status|watch');
  } catch(error) {
    if(action==='on') {for(const path of slots())unlinkSync(path);restoreInstalled();await run(['bun','install','--frozen-lockfile']);}
    throw error;
  } finally {
    for(const item of protectedFiles)if(!readFileSync(item.path).equals(item.bytes))throw new Error(`Link operation unexpectedly modified ${item.path}`);
  }
  return links();
}
