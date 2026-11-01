import { getProviderSettings, providerSettingsErrorResponse, updateProviderSettings } from "@/lib/settings/provider-settings-server";
import { ProviderConfigurationError } from "@/lib/settings/provider-profile";
import type { ProviderSettingsPatch } from "../../../../../../../scripts/lib/runtime-settings-store.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return Response.json({ ok: true, settings: getProviderSettings() }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return providerSettingsErrorResponse(error); }
}
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") || 0) > 16_384) throw new ProviderConfigurationError("provider_configuration_invalid", "The settings update is too large.");
    const text = await request.text();
    if (Buffer.byteLength(text) > 16_384) throw new ProviderConfigurationError("provider_configuration_invalid", "The settings update is too large.");
    let patch: ProviderSettingsPatch;
    try { patch = JSON.parse(text); } catch { throw new ProviderConfigurationError("provider_configuration_invalid", "Settings must be a JSON object."); }
    return Response.json({ ok: true, settings: await updateProviderSettings(patch) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return providerSettingsErrorResponse(error); }
}
