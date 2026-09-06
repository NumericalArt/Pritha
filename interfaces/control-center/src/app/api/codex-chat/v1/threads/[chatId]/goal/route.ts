import { apiError, apiSuccess, readJsonBody } from "@/lib/codex-chat/http";
import { getCodexChatGateway } from "@/lib/codex-chat/gateway";
import type { GoalBudgetRequest } from "@/lib/codex-chat/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await context.params;
    return apiSuccess(await getCodexChatGateway().threadGoal(chatId));
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request, context: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await context.params;
    const result = await getCodexChatGateway().updateGoalBudget(chatId, await readJsonBody<GoalBudgetRequest>(request));
    return apiSuccess(result.goal, { replayed: result.replayed });
  } catch (error) { return apiError(error); }
}
