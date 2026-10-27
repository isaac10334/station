import { useEffect, useSyncExternalStore } from "react";
import { getAccountState, startAccountClient, subscribeAccount } from "../../services/account-client";

/** React subscribes to the transport service; service ownership stays outside UI. */
export function useAccount() {
  const state = useSyncExternalStore(subscribeAccount, getAccountState);
  useEffect(() => { void startAccountClient(); }, []);
  return state;
}
