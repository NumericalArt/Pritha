export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    ok: true,
    service: "pritha-control-center",
    status: "experimental",
    timestamp: new Date().toISOString(),
  });
}
