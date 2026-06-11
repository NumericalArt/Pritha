import { SettingsControlPage } from "@/components/settings/SettingsControlPage";
import { getControlCenterStatus } from "@/lib/control-center/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function SettingsPage() {
  const status = await getControlCenterStatus();
  return <SettingsControlPage access={status.access} />;
}
