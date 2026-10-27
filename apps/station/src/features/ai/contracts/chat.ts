import type { ToolSet } from "ai";
import type { AIProgress } from "../../../contracts/ai-conversation";
import type { AISettingsStore, GrantedWidgetScope } from "../../../contracts/widget-runtime";
import type { ModelCatalogPort } from "./catalog";
import type { PromptAttachment, PromptContextPort } from "./context";
export type DraftProposal = { name: string; html: string; format?: "html" } | { name: string; markdown: string; format: "markdown" };
export type ChatContextRead = { resource: string; content: string };
export type ChatMessage = { role: string; text: string; attachments?: readonly PromptAttachment[]; status?: "streaming" | "done" | "error" | "stopped"; tools?: AIProgress[]; context?: ChatContextRead[]; activity?: string[] };
/** Dependencies never contain selected providers, raw stores or owner dispatch.
 * Task tools are built with the existing opaque task context and command policy.
 */
export interface ChatPorts {
  settings: AISettingsStore;
  catalog: ModelCatalogPort;
  context?: PromptContextPort;
  openScope(workspaceId: string, instanceId: string, grants: Iterable<string>): GrantedWidgetScope;
  tasks: {
    list(workspaceId: string): readonly { id: string; name: string }[];
    check(id: string): void;
    subscribe(listener: () => void): () => void;
  };
  tools(request: { taskId: string; scope: GrantedWidgetScope; grants: ReadonlySet<string>; review(draft: DraftProposal): Promise<boolean>; activity(message: string): void; context(read: ChatContextRead): void }): ToolSet;
}
