import { NextResponse } from "next/server";
import { codexLoginPlan } from "@/lib/settings/codex-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(codexLoginPlan("chatgpt"));
}
