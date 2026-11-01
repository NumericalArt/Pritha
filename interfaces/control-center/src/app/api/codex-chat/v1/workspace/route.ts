import { apiError, apiSuccess } from "@/lib/codex-chat/http";
import { getCodexChatGateway } from "@/lib/codex-chat/gateway";
import type {ProviderConnectorId} from '@/lib/settings/provider-profile';
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request:Request) {
  try { return apiSuccess(await getCodexChatGateway().workspacePreview(new URL(request.url).searchParams.get('connectorId') as ProviderConnectorId || undefined)); }
  catch(error) { return apiError(error); }
}
