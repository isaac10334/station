import { draftSchema,type ProgramDraft,type ProgramSnapshot } from '../core/programs';
import type { Asset } from "../core/asset-state";
import { validSourcePath } from '../core/source-project';
import { sourceSha256 } from '../core/build-contract';
import { portableSchema,validatePortableValue } from '../core/portable-schema';
import { compileProgram } from './program-compiler';
import { engineResources } from './program-engine';
/** Shared local/package activation. It builds immutable code but never runs it or grants authority. */
export async function prepareProgram(raw:ProgramDraft,assets:readonly Asset[],definitionId?:string,revision=0,signal?:AbortSignal):Promise<ProgramSnapshot>{
 const draft=draftSchema.parse(raw);
 if(draft.inputSchema!==undefined){portableSchema(draft.inputSchema);validatePortableValue(draft.inputSchema,draft.input);}if(draft.outputSchema!==undefined)portableSchema(draft.outputSchema);
 for(const method of draft.methods){if(['__proto__','prototype','constructor'].includes(method.name))throw new Error('Reserved method name');portableSchema(method.input);portableSchema(method.output);}
 if(new Set(draft.methods.map(method=>method.name)).size!==draft.methods.length)throw new Error('Duplicate method');
 if(draft.assetType){portableSchema(draft.assetType.schema);validatePortableValue(draft.assetType.schema,draft.assetType.starter);}
 const dependencies:Record<string,string>={};
 for(const id of draft.dependencies){const asset=assets.find(asset=>asset.id===id);if(!asset?.files)throw new Error('Selected dependency unavailable');for(const [path,source]of Object.entries(asset.files)){if(!validSourcePath(path))throw new Error('Invalid dependency path');dependencies[`dependencies/${id}/${path}`]=source;}}
 if(JSON.stringify(dependencies).length>524288)throw new Error('Dependency budget exceeded');
 const [code,engine,sourceHash,dependencyHash]=await Promise.all([compileProgram(draft,dependencies,signal),engineResources(),sourceSha256(draft.files),sourceSha256(dependencies)]);signal?.throwIfAborted();
 return {id:crypto.randomUUID(),definitionId,revision,sourceSha256:sourceHash,dependenciesSha256:dependencyHash,engineSha256:engine.manifest.sha256,code,draft:structuredClone(draft),createdAt:Date.now()};
}
