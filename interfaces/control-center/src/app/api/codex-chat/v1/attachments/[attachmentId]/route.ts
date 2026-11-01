import { Readable } from "node:stream";
import { getCodexChatGateway } from "@/lib/codex-chat/gateway";
import { AttachmentError } from "@/lib/codex-chat/attachment-store";
import { apiError, apiSuccess } from "@/lib/codex-chat/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ attachmentId: string }> };

export async function PUT(request: Request, context: Context) {
  try {
    let name: string;
    try { name = decodeURIComponent(request.headers.get("x-attachment-name") || "attachment"); }
    catch { throw new AttachmentError("invalid_request", "The attachment name is invalid."); }
    return apiSuccess(await getCodexChatGateway().attachments.upload((await context.params).attachmentId, name, request), { status: 201 });
  } catch (error) { return apiError(error); }
}

export async function GET(_request: Request, context: Context) {
  try {
    const { handle, view } = await getCodexChatGateway().attachments.openOriginal((await context.params).attachmentId);
    return new Response(Readable.toWeb(handle.createReadStream({start:0})) as ReadableStream<Uint8Array>, { headers: {
      "Content-Type": view.mediaType,
      "Content-Length": String(view.size),
      "Content-Disposition": `${view.kind === "image" ? "inline" : "attachment"}; filename="attachment"; filename*=UTF-8''${encodeURIComponent(view.name)}`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
    } });
  } catch (error) { return apiError(error); }
}
