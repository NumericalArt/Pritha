import { randomUUID } from "node:crypto";
import { CodexChatGatewayError } from "./gateway";
import type { ApiErrorEnvelope, ApiSuccess } from "./types";

const JSON_BODY_LIMIT = 256 * 1024;

export function apiSuccess<T>(data: T, options: { status?: number; replayed?: boolean } = {}) {
  const payload: ApiSuccess<T> = {
    apiVersion: "1",
    requestId: randomUUID(),
    data,
    ...(options.replayed === undefined ? {} : { replayed: options.replayed }),
  };
  return Response.json(payload, {
    status: options.status || 200,
    headers: { "Cache-Control": "no-store" },
  });
}

export function apiError(error: unknown) {
  const requestId = randomUUID();
  const known = error instanceof CodexChatGatewayError;
  const registryCorrupt = !known && (error as { code?: unknown } | null)?.code === "codex_chat_registry_corrupt";
  const status = known ? error.status : registryCorrupt ? 503 : 500;
  const payload: ApiErrorEnvelope = {
    apiVersion: "1",
    error: {
      code: known ? error.code : registryCorrupt ? "codex_chat_registry_corrupt" : "internal_error",
      message: known
        ? error.message
        : registryCorrupt
          ? "Task Chat history bindings are read-only until the private registry is recovered."
          : "Task Chat encountered an internal error.",
      retryable: known ? error.retryable : registryCorrupt,
      requestId,
    },
  };
  return Response.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}

export async function readJsonBody<T>(request: Request): Promise<T> {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > JSON_BODY_LIMIT) {
    throw new CodexChatGatewayError("payload_too_large", "JSON body exceeds 256 KiB.", 413);
  }
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > JSON_BODY_LIMIT) {
    throw new CodexChatGatewayError("payload_too_large", "JSON body exceeds 256 KiB.", 413);
  }
  try {
    return JSON.parse(text || "{}") as T;
  } catch {
    throw new CodexChatGatewayError("invalid_request", "Request body must be valid JSON.", 400);
  }
}

export function requireIdempotencyKey(request: Request) {
  const key = request.headers.get("idempotency-key") || "";
  if (!/^[\x20-\x7E]{8,128}$/.test(key)) {
    throw new CodexChatGatewayError("invalid_request", "Idempotency-Key must contain 8–128 printable ASCII characters.", 400);
  }
  return key;
}

export function integerQuery(value: string | null, fallback: number, min: number, max: number) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new CodexChatGatewayError("invalid_request", `Query value must be an integer from ${min} to ${max}.`, 400);
  }
  return parsed;
}
