import { useSyncExternalStore } from "react";
import { deps } from "../../composition";
/** Presentation reads the trusted store's session policy; it does not enforce room authority. */
export const useSourceEditing = (assetId: string) =>
  useSyncExternalStore(deps.store.subscribe, () =>
    deps.store.canEditSource(assetId),
  );
