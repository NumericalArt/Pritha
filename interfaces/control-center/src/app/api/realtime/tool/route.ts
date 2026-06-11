import { NextResponse } from "next/server";
import { handlePrithaRealtimeTool } from "@/lib/realtime/pritha-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ToolPayload = {
  name?: string;
  arguments?: Record<string, unknown>;
};

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as ToolPayload;
  const name = String(payload.name || "");
  if (!name) return NextResponse.json({ ok: false, error: "missing_tool_name" }, { status: 400 });

  try {
    const output = await handlePrithaRealtimeTool(name, payload.arguments || {});
    return NextResponse.json(output);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "tool_failed",
      },
      { status: 500 },
    );
  }
}
