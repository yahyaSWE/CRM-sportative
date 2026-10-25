import { AsyncLocalStorage } from 'node:async_hooks';

// Vem eller vad som utför den pågående förfrågan, t.ex. { via: 'claude' } när den kommer genom MCP-kopplingen.
// Läses av audit() och av databastriggern som märker tidslinjens aktiviteter.
export const requestContext = new AsyncLocalStorage();
export const currentVia = () => requestContext.getStore()?.via ?? null;
