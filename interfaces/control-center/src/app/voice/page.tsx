import { VoiceControlPage } from "@/components/voice/VoiceControlPage";
import { getControlCenterStatus } from "@/lib/control-center/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function VoicePage() {
  const status = await getControlCenterStatus();
  return <VoiceControlPage status={status} />;
}
