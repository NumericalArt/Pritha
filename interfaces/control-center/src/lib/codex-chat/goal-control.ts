import { createHash } from "node:crypto";
import type { GoalBudgetRequest, ThreadGoalView } from "./types";

type NativeGoal = { threadId: string; objective: string; status: string; tokensUsed: number; tokenBudget: number | null; createdAt: number };
export type GoalBudgetReceipt = {
  sourceTextHash?: string;
  request: GoalBudgetRequest;
  requestHash: string;
  objectiveIdentity: string;
  previousBudget: number | null;
  targetBudget: number;
  usageFloor: number;
  status: "prepared" | "applied" | "superseded";
};
type GoalControlContext = {
  threadId: string;
  read: () => Promise<unknown>;
  set: (params: { threadId: string; tokenBudget: number; status?: "active" }) => Promise<unknown>;
  receipts: () => Promise<Record<string, GoalBudgetReceipt>>;
  save: (id: string, receipt: GoalBudgetReceipt) => Promise<void>;
};

export class GoalControlError extends Error {
  constructor(readonly code: string, message: string, readonly status = 409, readonly retryable = false) { super(message); }
}

const statuses = new Set(["active", "paused", "blocked", "usageLimited", "budgetLimited", "complete"]);
function hash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function objectiveIdentity(goal: NativeGoal) { return hash([goal.threadId, goal.objective, goal.createdAt]); }
function revision(goal: NativeGoal) { return hash([objectiveIdentity(goal), goal.tokenBudget, goal.tokensUsed, goal.status]); }
export function emptyGoalView(availability: ThreadGoalView["availability"]): ThreadGoalView {
  return { availability, objective: null, status: null, tokensUsed: null, tokenBudget: null, revision: null, pendingRequest: null };
}

async function readGoal(context: GoalControlContext): Promise<NativeGoal | null> {
  const response = await context.read() as { goal?: NativeGoal | null } | null;
  if (response?.goal === null) return null;
  const goal = response?.goal;
  if (!goal || goal.threadId !== context.threadId || typeof goal.objective !== "string" || !goal.objective.trim() || goal.objective.length > 4_000
    || !statuses.has(goal.status) || !Number.isSafeInteger(goal.tokensUsed) || goal.tokensUsed < 0 || !Number.isSafeInteger(goal.createdAt)
    || (goal.tokenBudget !== null && (!Number.isSafeInteger(goal.tokenBudget) || goal.tokenBudget < 1))) {
    throw new GoalControlError("goal_unavailable", "The runtime did not return a verifiable Goal for this task.", 503, true);
  }
  return goal;
}

function receiptMatchesGoal(receipt: GoalBudgetReceipt, goal: NativeGoal) {
  return receipt.objectiveIdentity === objectiveIdentity(goal) && goal.tokensUsed >= receipt.usageFloor && goal.tokenBudget === receipt.targetBudget;
}

function view(goal: NativeGoal | null, pending: GoalBudgetReceipt | null): ThreadGoalView {
  return goal ? { availability: "available", objective: goal.objective, status: goal.status, tokensUsed: goal.tokensUsed, tokenBudget: goal.tokenBudget,
    revision: revision(goal), pendingRequest: pending?.request || null } : emptyGoalView("none");
}

function validateReceipt(receipt: GoalBudgetReceipt) {
  if (!receipt || !["prepared", "applied", "superseded"].includes(receipt.status) || !receipt.requestHash || !receipt.objectiveIdentity
    || !Number.isSafeInteger(receipt.targetBudget) || receipt.targetBudget < 1 || !Number.isSafeInteger(receipt.usageFloor) || !receipt.request?.requestId
    || (receipt.sourceTextHash !== undefined && !/^[a-f0-9]{64}$/.test(receipt.sourceTextHash))) {
    throw new GoalControlError("goal_receipt_invalid", "The saved budget change needs recovery before another change can be made.", 503, true);
  }
}

export async function readThreadGoal(context: GoalControlContext) {
  const goal = await readGoal(context);
  let pending: GoalBudgetReceipt | null = null;
  for (const receipt of Object.values(await context.receipts())) {
    validateReceipt(receipt);
    if (receipt.status !== "prepared") continue;
    if (goal && receiptMatchesGoal(receipt, goal)) {
      await context.save(receipt.request.requestId, { ...receipt, status: "applied" });
    } else if (!goal || goal.status === "complete" || goal.tokensUsed >= receipt.targetBudget
      || receipt.objectiveIdentity !== objectiveIdentity(goal) || (goal.tokenBudget !== receipt.previousBudget && goal.tokenBudget !== receipt.targetBudget)) {
      await context.save(receipt.request.requestId, { ...receipt, status: "superseded" });
    } else pending = receipt;
  }
  return view(goal, pending);
}

export async function changeThreadGoalBudget(context: GoalControlContext, input: GoalBudgetRequest) {
  if (!input || !/^[A-Za-z0-9_-]{8,128}$/.test(input.requestId) || !/^[a-f0-9]{64}$/.test(input.expectedRevision)
    || !["add", "set"].includes(input.mode) || !Number.isSafeInteger(input.tokens) || input.tokens < 1 || typeof input.resume !== "boolean") {
    throw new GoalControlError("goal_budget_invalid", "Choose a positive whole token amount and refresh the Goal before applying it.", 400);
  }
  const requestHash = hash([input.expectedRevision, input.mode, input.tokens, input.resume]);
  const receipts = await context.receipts();
  let receipt = receipts[input.requestId];
  if (receipt) {
    validateReceipt(receipt);
    if (receipt.requestHash !== requestHash) throw new GoalControlError("idempotency_conflict", "This budget request identifier was used with a different change.");
    if (receipt.status === "applied") return { goal: await readThreadGoal(context), replayed: true };
    if (receipt.status === "superseded") throw new GoalControlError("goal_changed", "The Goal has changed. Choose a new budget using its current state.");
  } else if (Object.values(receipts).some(row => row.status === "prepared")) {
    throw new GoalControlError("goal_change_pending", "Reconcile the saved budget change before applying another one.", 409, true);
  }
  let goal = await readGoal(context);
  if (!goal) throw new GoalControlError("goal_missing", "This task has no Goal to extend.");
  if (receipt && receiptMatchesGoal(receipt, goal)) {
    // A lost acknowledgement may hide a successful change. Readback settles it
    // without issuing another mutation or another continuation instruction.
    await context.save(input.requestId, { ...receipt, status: "applied" });
    return { goal: view(goal, null), replayed: true };
  }
  if (goal.status === "complete") throw new GoalControlError("goal_complete", "This Goal is already complete.");
  if (receipt) {
    if (receipt.objectiveIdentity !== objectiveIdentity(goal) || goal.tokenBudget !== receipt.previousBudget || goal.tokensUsed < receipt.usageFloor) {
      throw new GoalControlError("goal_changed", "The Goal changed after this request. Its current objective and usage were preserved.");
    }
  } else {
    if (input.expectedRevision !== revision(goal)) throw new GoalControlError("goal_changed", "The Goal changed. Refresh it before choosing a new budget.");
    if (input.mode === "add" && goal.tokenBudget === null) throw new GoalControlError("goal_budget_invalid", "Choose a total budget for an unlimited Goal.", 400);
    const targetBudget = input.mode === "add" ? (goal.tokenBudget || 0) + input.tokens : input.tokens;
    if (!Number.isSafeInteger(targetBudget) || targetBudget <= goal.tokensUsed) throw new GoalControlError("goal_budget_invalid", "The total budget must be a safe integer above the observed usage.", 400);
    receipt = { request: input, requestHash, objectiveIdentity: objectiveIdentity(goal), previousBudget: goal.tokenBudget, targetBudget, usageFloor: goal.tokensUsed, status: "prepared" };
  }
  if (receipt.targetBudget <= goal.tokensUsed) throw new GoalControlError("goal_changed", "Usage has reached the saved budget. Choose a new amount using the current Goal.");
  if (input.resume && goal.status === "usageLimited") throw new GoalControlError("account_usage_limited", "The account usage limit is separate from this Goal budget. Wait for account availability before resuming.");
  await context.save(input.requestId, receipt);
  // Always set the saved absolute target; never add again on a transport retry.
  // Omitting objective preserves the existing Goal and usage history.
  await context.set({ threadId: context.threadId, tokenBudget: receipt.targetBudget, ...(input.resume ? { status: "active" } : {}) });
  goal = await readGoal(context);
  if (!goal || !receiptMatchesGoal(receipt, goal)) throw new GoalControlError("goal_readback_unconfirmed", "The budget change needs a fresh readback. Retry this same request to reconcile it.", 503, true);
  await context.save(input.requestId, { ...receipt, status: "applied" });
  return { goal: view(goal, null), replayed: false };
}
