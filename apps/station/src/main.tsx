import "./ui/styles/station.css";
import { createRoot } from "react-dom/client";
import { WorkspaceApp } from "./ui/workspace-app";

createRoot(document.getElementById("app")!).render(<WorkspaceApp />);
