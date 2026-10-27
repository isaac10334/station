/** Persistence is injected; domain modules never select browser or native storage. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
