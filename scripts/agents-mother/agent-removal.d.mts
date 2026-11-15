export type AgentRemovalMove = { kind: "project" | "memory" | "factory" | "build" | "proposal"; from: string };
export type AgentRemovalBlocker = { code: string; message: string };
export type AgentRemovalPlan = {
  schema: "pritha-agent-removal-plan-v1";
  agentId: string;
  name: string;
  projectPath: string | null;
  moves: AgentRemovalMove[];
  blockers: AgentRemovalBlocker[];
  archiveRoot: string;
  removable: boolean;
  confirmationPhrase: string;
  planHash: string;
};
export type AgentRemovalOptions = { root?: string; stateRoot?: string; memoryRoot?: string; agentParent?: string; env?: Record<string, string | undefined> };
export class AgentRemovalError extends Error { code: string; }
export function planAgentRemoval(target: string, options?: AgentRemovalOptions): AgentRemovalPlan;
export function applyAgentRemoval(target: string, input: { planHash?: string; confirmation?: string; actor?: string }, options?: AgentRemovalOptions): { ok: true; archive: string; moved: number; name: string };
export function restoreAgentRemoval(archiveDir: string, options?: AgentRemovalOptions): { ok: true; restored: number; name: string };
