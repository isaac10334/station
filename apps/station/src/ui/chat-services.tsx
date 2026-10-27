/** Feature-specific injection. The root supplies these ports; views cannot reach bootstrap. */
import { createContext, useContext, type ReactNode } from "react";
import type { ChatPorts } from "../features/ai/contracts/chat";
const Context = createContext<ChatPorts | null>(null);
export function ChatServices({ value, children }: { value: ChatPorts; children: ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useChatServices() {
  const value = useContext(Context);
  if (!value) throw new Error("ChatServices must be supplied by the application root");
  return value;
}
