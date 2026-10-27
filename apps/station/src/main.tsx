import { ChatServices } from "./ui/chat-services";
import "./ui/styles/station.css";
import { createRoot } from "react-dom/client";
import { WorkspaceApp } from "./ui/workspace-app";
import { deps, sharing, demoSession } from "./composition";
import { resolvedSvgIcon } from './services/svg-icons';
import { ShortcutServices } from './ui/shortcut-services';
import { desktopShortcuts } from './services/desktop-shortcuts';

const root = createRoot(document.getElementById("app")!);
root.render(<ShortcutServices value={desktopShortcuts}><ChatServices value={deps.chat}><WorkspaceApp ports={{ workspace: deps.store, commands: deps.control, capabilities: deps, session: demoSession, resolveSvg:resolvedSvgIcon }} /></ChatServices></ShortcutServices>);
let programsVerified=false;
const verifyPrograms=()=>{if(programsVerified||!document.querySelector('meta[name="station-programs-verify"][content="1"]'))return;programsVerified=true;void import('./services/program-acceptance').then(module=>module.verifyNativePrograms(deps.control)).catch(console.error);};
window.addEventListener('station:desktop-ready',verifyPrograms);verifyPrograms();
void import("./services/agent-control-client").then(({ connectAgentControl }) => connectAgentControl(deps.control)).catch(console.error);
// Native hide does not emit pagehide. Destruction/reload releases owner effects,
// guest ports, streaming requests and the host's scopes before the document ends.
window.addEventListener("pagehide", (event) => {
  if (event.persisted) return;
  root.unmount();
  sharing.stop();
  void deps.dispose();
});
