/** Transient per-workspace history; neither asset identity nor saved placement changes.
 * Inject current-layout checks so deleted/moved instances cannot be activated.
 */
export function createNavigationHistory() {
  type Entry = { back: string[]; current: string; forward: string[] };
  const entries = new Map<string, Entry>();
  const entry = (workspaceId: string, current: string) => entries.get(workspaceId) ?? { back: [], current, forward: [] };
  return {
    get(workspaceId: string, current: string): Readonly<Entry> { return entry(workspaceId, current); },
    record(workspaceId: string, previous: string, next: string) {
      const value = entry(workspaceId, previous);
      if (value.current === next) return;
      value.back.push(value.current); value.current = next; value.forward = [];
      // Session history is bounded independently of saved layouts.
      value.back = value.back.slice(-200);
      entries.set(workspaceId, value);
    },
    move(workspaceId: string, current: string, direction: "back" | "forward", available: (id: string) => boolean): string | undefined {
      const value = entry(workspaceId, current);
      const source = value[direction], destination = direction === "back" ? value.forward : value.back;
      while (source.length) {
        const id = source.pop()!;
        if (!available(id)) continue;
        destination.push(value.current); value.current = id; entries.set(workspaceId, value);
        return id;
      }
    },
    dispose: () => entries.clear(),
  };
}
