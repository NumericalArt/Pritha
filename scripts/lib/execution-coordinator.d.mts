export class ExecutionConflict extends Error { code: string; constructor(code: string, message?: string); }
export type ExecutionIntent = Record<string, any> & { id: string; hash: string; kind: string; state: string; revision: number; createdAt: string; updatedAt: string };
export type ExecutionLease = { owner: string; generation: string; assertOwned(): void; release(): void };
export class ExecutionCoordinator {
  readonly file: string;
  admission():{enabled:boolean;capacity:number};
  setAdmission(enabled:boolean,capacity?:number):{enabled:boolean;capacity:number};
  constructor(options: { stateRoot: string; directory?: string });
  reserveIntent(key: string, hash: string, value: Record<string, unknown>, options?: {initialState?: "reserved" | "queued";limit?: {max:number;states:string[];scopeField?:string;scopeMax?:number}}): { created: boolean; intent: ExecutionIntent };
  getIntent(key: string): ExecutionIntent | null;
  getIntentById(id: string): ExecutionIntent | null;
  updateIntent(key: string, patch: Record<string, unknown>, expectedRevision?: number): ExecutionIntent;
  listIntents(options?: {states?: string[]; kind?: string; limit?: number}): ExecutionIntent[];
  claim(resources: string[], owner: string, options?: {kind?: string; detail?: Record<string, unknown>; capacity?: number; mode?: "read" | "write"}): ExecutionLease | null;
  eventWindow(): {oldest:number;newest:number};
  claims(): Array<{resource: string; owner: string; generation: string; kind: string; mode: string; pid: number; process_stamp: string | null; detail: Record<string, any>}>;
  reconcileRelease(owner: string, generation: string): number;
  extend(owner: string, generation: string, resources: string[], options?: {mode?: "read" | "write"}): boolean;
  appendEvent(value: Record<string, unknown>): void;
  events(after?: number): Array<Record<string, any> & {sequence: number}>;
  withMutation<T>(key: string, operation: () => Promise<T>, options?: {timeoutMs?: number}): Promise<T>;
  close(): void;
}
