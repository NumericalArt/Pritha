export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    ok: true,
    service: "pritha-control-center",
    status: "active",
    timestamp: new Date().toISOString(),
  });
}
