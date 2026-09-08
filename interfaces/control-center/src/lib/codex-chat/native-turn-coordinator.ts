import path from "node:path";
import { resolvePrithaStateRoot, resolveTechscopeRoot } from "@/lib/pritha-paths";
import { effectiveCodexHome, storageIdentity } from "./storage-identity";
import { ExecutionCoordinator } from "../../../../../scripts/lib/execution-coordinator.mjs";

const connections = new Map<string, ExecutionCoordinator>();

export function nativeExecutionCoordinator() {
  const root = resolveTechscopeRoot();
  const stateRoot = resolvePrithaStateRoot(root);
  const directory = path.join(stateRoot === root ? path.join(root, ".private") : stateRoot, "codex-chat", "execution");
  let coordinator = connections.get(directory);
  if (!coordinator) { coordinator = new ExecutionCoordinator({ stateRoot, directory }); connections.set(directory, coordinator); }
  return coordinator;
}

/** Binary/provider aliases sharing CODEX_HOME are one native storage domain. */
export function nativeThreadLeaseKey(storageOrProvider: string, threadId: string) {
  const identity = storageOrProvider.startsWith("storage-v2:") ? storageOrProvider : storageIdentity(effectiveCodexHome());
  return `native:${identity}:${threadId}`;
}

type ClaimOptions = NonNullable<Parameters<ExecutionCoordinator["claim"]>[2]> & {
  coordinator?: ExecutionCoordinator;
  resources?: string[];
};
export function tryAcquireNativeThreadTurn(key: string, owner: string, options: ClaimOptions = {}) {
  const { coordinator = nativeExecutionCoordinator(), resources = [], ...policy } = options;
  const lease = coordinator.claim([key, ...resources], owner, { kind: "native", ...policy });
  if (!lease) return null;
  return Object.assign(() => lease.release(), { assertOwned: lease.assertOwned, owner: lease.owner, generation: lease.generation });
}
