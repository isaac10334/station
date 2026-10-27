import { lazy, Suspense } from "react";
import type { RichTextEditorProps } from "./rich-text-contract";
export { RichTextAssetsContext, type RichTextEditorProps } from "./rich-text-contract";
const Engine = lazy(() => import("./rich-text-editor-engine"));
/** One rich editing surface for assets, widgets and inline Markdown properties.
 * Lazy engine loading does not acquire services or activate authored programs. */
export function RichTextEditor(props: RichTextEditorProps) {
  return <Suspense fallback={<p className="p-3 text-sm text-fg-3">Loading text editor…</p>}><Engine {...props} /></Suspense>;
}
