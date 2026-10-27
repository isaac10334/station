import { deps } from "../../composition";
/** Legacy UI wiring adapter. Operation ownership and cancellation live in the shared application client. */
export const controlOperation = <T>(method: string, params: unknown, signal?: AbortSignal) => deps.commands.run<T>(method, params, signal);
