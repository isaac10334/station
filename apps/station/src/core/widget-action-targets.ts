import { HOME_ID, panelSlot, panelSurface, type Command, type DockLayout } from "./docking";

/** Resolve live ownership before revealing a target. Definitions/asset IDs are
 * never substituted for instance IDs, and the main surface cannot hide itself. */
export function actionTargetCommands(layout: DockLayout, targetId: string, toggle: boolean): Command[] {
  if (!layout.panels[targetId]) throw new Error("Target widget no longer exists");
  if (toggle && layout.floating[targetId]) return [{type:"windowVisibility",panelId:targetId,hidden:!layout.floating[targetId].hidden}];
  const surface=panelSurface(layout,targetId), slot=panelSlot(layout,targetId), commands:Command[]=[];
  if (surface === "bottom" || surface === "sidebar") {
    const hide=toggle && !slot?.target.ownerId && !layout.hidden[surface];
    commands.push({type:"visibility",surface,hidden:hide}); if(hide)return commands;
  } else if (surface === "main") commands.push({type:"visibility",surface,hidden:false});
  if(surface === "dashboard" && layout.panels[HOME_ID]) commands.push({type:"activate",panelId:HOME_ID});
  const chain:string[]=[]; let current:string|undefined=targetId;
  while(current && current!==layout.rootId && !chain.includes(current)) {chain.unshift(current);current=layout.panels[current]?.ownerId;}
  for(const panelId of chain) {if(layout.floating[panelId])commands.push({type:"windowVisibility",panelId,hidden:false});commands.push({type:"activate",panelId});}
  return commands;
}
