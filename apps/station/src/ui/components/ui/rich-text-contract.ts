import { createContext } from "react";
/** Asset identity is deliberately outside the rich value/editor. Hosts may offer
 * a private copy without silently changing a Markdown property's string type. */
export const RichTextAssetsContext = createContext<undefined | { createMarkdown(name: string, source: string): string; open(id: string): void }>(undefined);
export type RichTextEditorProps = {
  label: string; source: string; format: "markdown" | "note"; readOnly?: boolean;
  /** An owning overlay already provides expansion and focus management. */
  contained?: boolean;
  /** Document-first widgets disclose source/export options on demand. Formatting follows text selection. */
  compact?: boolean;
  /** Presentation-only dirty state; never commits or grants authority. */
  onDirtyChange?: (dirty: boolean) => void;
  maxLength?: number; allowCreateAsset?: boolean;
  onCommit(source: string, expected: string): void | Promise<void>;
};
