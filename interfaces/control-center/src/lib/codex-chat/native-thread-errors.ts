export type NativeThreadReadFailure =
  | "history_timeout"
  | "native_thread_missing"
  | "runtime_unavailable"
  | "history_unavailable";

export function classifyNativeThreadReadFailure(value: unknown): NativeThreadReadFailure {
  const message = String(value instanceof Error ? value.message : value || "");
  if (/timed out/i.test(message)) return "history_timeout";
  if (/not found|missing_thread|unknown thread|thread.*does not exist|thread not loaded|no rollout found/i.test(message)) {
    return "native_thread_missing";
  }
  if (/unavailable|exited|connection closed|broken pipe|EPIPE|write after end|socket|transport/i.test(message)) {
    return "runtime_unavailable";
  }
  return "history_unavailable";
}
