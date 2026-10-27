/** Curated virtual filesystem bundler; it has no remote or npm resolver. */
import * as esbuild from "esbuild-wasm";
let ready:Promise<void>, resources:Record<string,string>={};
function normalize(path:string) {const out:string[]=[];for(const part of path.split('/')) {if(part==='..'){if(!out.length)throw new Error('Import escapes project');out.pop();}else if(part&&part!=='.')out.push(part);}return out.join('/');}
self.onmessage=async(event)=>{const {id,op}=event.data;try{
 if(op==='init'){resources=event.data.resources;const bytes=Uint8Array.from(atob(event.data.wasm),(c)=>c.charCodeAt(0));ready=esbuild.initialize({wasmModule:await WebAssembly.compile(bytes),worker:false});await ready;self.postMessage({id,value:true});return;}
 await ready;
 const files:Record<string,string>={...resources,...event.data.files};
 files['node_modules/@station/sdk/index.js']=`import {createGuestSdk} from '@loop-kit/scripting'; const sdk=createGuestSdk(globalThis.__stationBindings);export const invoke=sdk.invoke, subscribe=sdk.subscribe, ui=sdk.ui, configuration=Object.freeze(globalThis.__stationConfiguration??{});`;
 const find=(path:string)=>{for(const p of [path,path+'.ts',path+'.tsx',path+'.js',path+'.json',path+'/index.js'])if(Object.hasOwn(files,p))return p;throw new Error('Dependency is unavailable: '+path);};
 const result=await esbuild.build({entryPoints:[event.data.entry],bundle:true,write:false,format:'iife',globalName:'__stationProgram',platform:'neutral',target:'es2022',minify:true,jsxFactory:'ui.h',jsxFragment:'ui.fragment',plugins:[{name:'approved-script-files',setup(build){build.onResolve({filter:/.*/},args=>{if(/^(https?:|node:|data:|file:)/.test(args.path))throw new Error('Remote and host imports are unavailable');let path:string;if(args.kind==='entry-point')path=normalize(args.path);else if(args.path.startsWith('.'))path=normalize(args.importer.slice(0,args.importer.lastIndexOf('/')+1)+args.path);else if(['@station/sdk','@loop-kit/ui','@loop-kit/scripting','@loop-kit/capabilities'].includes(args.path))path='node_modules/'+args.path+'/index.js';else if(args.path.startsWith('@selected/'))path='dependencies/'+args.path.slice(10);else throw new Error('Select this asset/package dependency explicitly: '+args.path);return {path:find(path),namespace:'program'};});build.onLoad({filter:/.*/,namespace:'program'},args=>({contents:files[args.path],loader:args.path.endsWith('.tsx')?'tsx':args.path.endsWith('.ts')?'ts':args.path.endsWith('.json')?'json':'js'}));}}]});
 const output=result.outputFiles![0]!.text;
 self.postMessage({id,value:`globalThis.__stationBindings=bindings;${output}\nreturn await __stationProgram.default(input);`});
}catch(error){self.postMessage({id,error:String(error)});}};
