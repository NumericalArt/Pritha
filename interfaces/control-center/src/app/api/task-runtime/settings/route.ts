import { getProviderSettings, providerSettingsErrorResponse, updateProviderSettings } from "@/lib/settings/provider-settings-server";
import { ProviderConfigurationError } from "@/lib/settings/provider-profile";
import type { ProviderSettingsPatch } from "../../../../../../../scripts/lib/runtime-settings-store.mjs";
import {readProviderSettingsInput} from "../../../../../../../scripts/lib/provider-settings-api.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return Response.json({ ok: true, settings: getProviderSettings() }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return providerSettingsErrorResponse(error); }
}
export async function POST(request: Request) {
  try {
    let patch: ProviderSettingsPatch;
    try { patch = await readProviderSettingsInput(request) as ProviderSettingsPatch; } catch { throw new ProviderConfigurationError("provider_configuration_invalid", "Send a bounded JSON settings update and try again."); }
    return Response.json({ ok: true, settings: await updateProviderSettings(patch) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return providerSettingsErrorResponse(error); }
}
