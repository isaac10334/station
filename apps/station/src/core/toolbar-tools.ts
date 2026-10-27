/** Internal shell widget definitions. They are intentionally absent from the
 * creation catalog: the host owns their callbacks, order and required presence. */
export const TOOLBAR_TOOL_DEFINITIONS = Object.freeze(Object.fromEntries([
  "back", "forward", "search", "undo", "redo", "palette", "inspector",
  "notifications", "widgets", "theme", "user",
].map(id => [id, Object.freeze({ id: `builtin:toolbar/${id}`, listed: false, protected: true, presentation: "compact" })])));
