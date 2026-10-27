import { X, Minus, Minimize } from "../../lib/icons";
import { ActionTooltip } from "../ui/action-tooltip";

/** Window actions stay outside the pickup surface; every control has a real
 * docking/lifecycle action and an accessible label, including touch and keyboard. */
export function WindowControls({ title, onClose, onDock, onMinimize }: { title: string; onClose: () => void; onDock: () => void; onMinimize?: () => void }) {
  return <div className="station-window-controls">
    <ActionTooltip label={`Close ${title}`}><button type="button" aria-label={`Close ${title}`} data-window-action="close" onClick={onClose}><X size={11} /></button></ActionTooltip>
    {onMinimize && <ActionTooltip label={`Minimize ${title}`}><button type="button" aria-label={`Minimize ${title}`} onClick={onMinimize}><Minus size={11} /></button></ActionTooltip>}
    <ActionTooltip label={`Dock ${title}`}><button type="button" aria-label={`Dock ${title}`} onClick={onDock}><Minimize size={11} /></button></ActionTooltip>
  </div>;
}
