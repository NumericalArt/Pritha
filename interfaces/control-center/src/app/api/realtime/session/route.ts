import { NextResponse } from "next/server";
import {
  buildRealtimeSessionConfig,
  createEphemeralRealtimeSession,
  RealtimeProviderError,
} from "@/lib/realtime/pritha-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const session = await createEphemeralRealtimeSession();
    const config = buildRealtimeSessionConfig();
    return NextResponse.json({
      client_secret: session.client_secret,
      model: config.model,
      voice: config.audio.output.voice,
      tools: config.tools.map((tool) => tool.name),
    });
  } catch (error) {
    if (error instanceof RealtimeProviderError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.providerCode ?? "provider_error",
        },
        { status: error.status >= 400 && error.status < 600 ? error.status : 502 },
      );
    }

    return NextResponse.json({ error: "Could not create realtime session" }, { status: 502 });
  }
}
