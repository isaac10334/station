import { useEffect,useState,useSyncExternalStore } from 'react';
import type { DataAsset } from "../../../core/asset-state";
import { parseProgramAsset } from '../../../core/programs';
import { deps } from '../../../composition';
import { ProgramAuthor } from './program-author';
import { PortableSurface } from './portable-surface';
import { controlOperation } from '../../lib/control-operation';
/** Preview is an explicitly started instance; catalog previews never invoke this path. */
export function ProgramDefinitionEditor({asset,ownerId}:{asset:DataAsset;ownerId:string}) {
 useSyncExternalStore(deps.programs.subscribe,deps.programs.version);const [error,setError]=useState('');
 useEffect(()=>()=>deps.programs.stop(ownerId),[ownerId]);
 try {const draft=parseProgramAsset(asset.files),frame=deps.programs.frame(ownerId);return <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto"><ProgramAuthor id={ownerId} initial={draft} assetId={asset.id} kind={draft.role==='widget'?'widget':draft.role==='action'?'action':'service'}/><section className="min-w-0 p-3" aria-label="Isolated live preview"><h3 className="mb-3 text-sm font-medium">Live preview</h3>{frame?<PortableSurface frame={frame} onEvent={event=>void controlOperation("programs.event",{instanceId:ownerId,event}).catch(reason=>setError(String(reason)))}/>:<p className="text-xs text-fg-3">Build snapshot, then Start to preview this instance. Bindings are empty until explicitly reviewed.</p>}{error&&<p role="alert" className="text-xs text-danger">{error}</p>}</section></div>;}catch(reason){return <p role="alert" className="p-3 text-xs text-danger">{String(reason)}. Open source to recover this draft.</p>;}
}
