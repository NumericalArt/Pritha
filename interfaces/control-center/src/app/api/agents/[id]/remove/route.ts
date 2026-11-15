import path from "node:path";
import { applyAgentRemoval, planAgentRemoval, type AgentRemovalPlan } from "../../../../../../../../scripts/agents-mother/agent-removal.mjs";
import { resolvePrithaAgentParent, resolvePrithaRoot, resolvePrithaStateRoot } from "@/lib/pritha-paths";

export const dynamic = "force-dynamic";

// The browser sees folder names and state-relative paths, never absolute ones.
function view(plan: AgentRemovalPlan) {
  const root = resolvePrithaRoot(), stateRoot = resolvePrithaStateRoot(root), agentParent = resolvePrithaAgentParent(root);
  const label = (from: string) => from.startsWith(agentParent + path.sep) ? path.basename(from) : path.relative(stateRoot, from);
  return {
    ok: true, agentId: plan.agentId, name: plan.name, removable: plan.removable, planHash: plan.planHash,
    confirmationPhrase: plan.confirmationPhrase, blockers: plan.blockers,
    moves: plan.moves.map((move) => ({ kind: move.kind, label: label(move.from) })),
  };
}

function failure(error: unknown) {
  const code = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : "removal_error";
  const status = code === "agent_not_found" ? 404 : code === "removal_failed" ? 500 : 409;
  return Response.json({ ok: false, error: code, message: error instanceof Error ? error.message : "Removal failed." }, { status });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try { return Response.json(view(planAgentRemoval(id, { root: resolvePrithaRoot() }))); }
  catch (error) { return failure(error); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { planHash?: unknown; confirmation?: unknown };
  try {
    const root = resolvePrithaRoot();
    const result = applyAgentRemoval(id, {
      planHash: typeof body.planHash === "string" ? body.planHash : "",
      confirmation: typeof body.confirmation === "string" ? body.confirmation : "",
      actor: "user",
    }, { root });
    return Response.json({ ok: true, name: result.name, moved: result.moved, archive: path.relative(resolvePrithaStateRoot(root), result.archive) });
  } catch (error) { return failure(error); }
}
