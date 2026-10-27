import { useMemo } from "react";
import { ReactFlow, Background, Controls, useNodesState, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { DataRecord } from "../../../core/data-sources";
/** Reusable data projection, also used by the script playground. Positions are
 * local view state; edges visualize referenced record IDs, never execute code. */
export function RecordGraph({ records, labelBy, edgeTo }: { records: DataRecord[]; labelBy?: string; edgeTo?: string }) {
  const initial = useMemo<Node[]>(() => records.map((r,i) => ({ id: r.id, position: { x: (i % 4) * 220, y: Math.floor(i / 4) * 130 }, data: { label: String(r.values[labelBy ?? "name"] ?? r.id) }, style: { background: "var(--raised)", color: "var(--fg)", border: "1px solid var(--line)", borderRadius: 8, width: 180 } })), [records, labelBy]);
  return <GraphContents key={JSON.stringify(initial.map(n=>[n.id,n.data.label]))} initial={initial} records={records} edgeTo={edgeTo} />;
}
function GraphContents({ initial, records, edgeTo }: { initial: Node[]; records: DataRecord[]; edgeTo?: string }) {
  const [nodes,, onNodesChange] = useNodesState(initial), ids = new Set(records.map(r => r.id));
  const edges = edgeTo ? records.flatMap(r => String(r.values[edgeTo] ?? "").split(",").map(x => x.trim()).filter(x => ids.has(x)).map(target => ({ id: `${r.id}:${target}`, source: r.id, target }))) : [];
  return <div className="h-80 min-h-64 w-full border border-line bg-frame" aria-label="Record graph"><ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} nodesConnectable={false} fitView minZoom={0.15} colorMode="system"><Background /><Controls showInteractive={false} /></ReactFlow></div>;
}
