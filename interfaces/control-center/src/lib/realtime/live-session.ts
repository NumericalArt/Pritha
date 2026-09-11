// GPT-Live protocol, verified against OpenAI's Live migration guide 2026-09-11.
// Keep the conversation, backend response lifecycle, and actual playback separate.
export const LIVE_MODEL = "gpt-live-1";
export const DEFAULT_LIVE_BACKEND = "gpt-5.6-terra";
export const isLiveModel = (model: string) => model === LIVE_MODEL;

// Live's per-session appended-input limit is 128 items / 32768 UTF-8 bytes.
// Leave space for provider accounting and keep individual tool results small.
const INPUT_BYTE_BUDGET = 30000;
const INPUT_ITEM_BUDGET = 120;
const byteLength = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
export function boundedLiveToolOutput(value: unknown, budget: number): string {
  const full = JSON.stringify(value) ?? "null";
  if (byteLength(full) <= budget) return full;
  const compact = {
    truncated: true,
    original_bytes: new TextEncoder().encode(full).length,
    note: "Partial tool result. Request a narrower read if needed. Do not repeat a completed action to retrieve its result.",
    output_preview: "",
  };
  const chars = Array.from(full);
  let low = 0, high = chars.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    compact.output_preview = chars.slice(0, middle).join("");
    if (byteLength(JSON.stringify(compact)) <= budget) low = middle;
    else high = middle - 1;
  }
  compact.output_preview = chars.slice(0, low).join("");
  return JSON.stringify(compact);
}

type FunctionItem = { type?: string; name?: string; call_id?: string; arguments?: string };
type Event = {
  type?: string; event_id?: string; delegation_id?: string; target?: string; response_id?: string;
  event?: Event; item?: FunctionItem; delta?: string; start_ms?: number; end_ms?: number;
  response?: { id?: string; status?: string; usage?: unknown };
  usage?: { seconds?: number }; reason?: string; client_event_id?: string;
  error?: { message?: string; code?: string; client_event_id?: string };
};
type Callbacks = {
  send: (event: Record<string, unknown>) => void;
  runTool: (item: FunctionItem) => Promise<unknown>;
  transcript: (role: "user" | "assistant", delta: string, start: number, end: number) => void;
  ready: () => void;
  closed: (event: Event) => void;
  error: (message: string) => void;
  usage?: (seconds: number | undefined, backend: unknown) => void;
  diagnostic?: (event: Record<string, unknown>) => void;
};

export function liveSessionConfig(options: {
  voice: string; instructions: string; conversationInstructions: string;
  tools: unknown[]; backend?: string;
}) {
  return {
    model: LIVE_MODEL,
    store: false,
    instructions: options.conversationInstructions,
    audio: { output: { voice: options.voice } },
    delegation: {
      type: "responses",
      responses: {
        model: options.backend || DEFAULT_LIVE_BACKEND,
        instructions: options.instructions,
        // Existing function definitions use optional fields; preserve their semantics.
        tools: options.tools.map(tool => ({ ...(tool as object), strict: false })),
        tool_choice: "auto", parallel_tool_calls: false,
      },
    },
  };
}

export class LiveSession {
  ready = false;
  closing = false;
  private disposed = false;
  private responses = new Map<string, { delegation: string; calls: Map<string, FunctionItem>; terminal: boolean }>();
  private delegations = new Map<string, string>();
  private toolResults = new Map<string, string>();
  private seenEvents = new Set<string>();
  private queue: Promise<void> = Promise.resolve();
  private responseActive = false;
  private queuedResponse = false;
  private inputBytes = 0;
  private inputItems = 0;
  private backendBlocked = false;
  private pending = new Map<string, { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  constructor(private callbacks: Callbacks) {}

  private blockBackend(code: string) {
    if (this.backendBlocked) return;
    this.backendBlocked = true;
    this.responseActive = false;
    this.queuedResponse = false;
    this.callbacks.diagnostic?.({ code, input_bytes: this.inputBytes, input_items: this.inputItems });
    this.callbacks.error("Voice tool workflow paused. Reconnect to continue; check completed actions before retrying.");
    this.context("The tool workflow is paused because its result could not be safely delivered. Ask the user to reconnect. Do not claim the operation failed or repeat completed actions.", "commentary");
  }

  private send(event: Record<string, unknown>) {
    if (this.disposed || !this.ready || this.closing) return false;
    const isInput = event.type === "response.item.create";
    if ((isInput || event.type === "response.create") && this.backendBlocked) return false;
    const size = isInput ? byteLength(event.item) : 0;
    if (isInput && (this.inputItems >= INPUT_ITEM_BUDGET || this.inputBytes + size > INPUT_BYTE_BUDGET)) {
      this.blockBackend("input_budget_exhausted");
      return false;
    }
    try { this.callbacks.send({ event_id: crypto.randomUUID(), ...event }); }
    catch {
      if (isInput || event.type === "response.create") this.blockBackend("transport_send_failed");
      return false;
    }
    if (isInput) { this.inputBytes += size; this.inputItems++; }
    return true;
  }
  context(text: string, kind: "thinking" | "commentary" | "instructions" = "thinking") {
    // UTF-8 byte bound is conservative for the documented 500-token append limit.
    // Split code points, preserving text and never promoting tool output to instructions.
    let part = "";
    const encoder = new TextEncoder();
    for (const char of text) {
      if (encoder.encode(part + char).length > 480) {
        this.send({ type: `session.${kind}.append`, delegation_id: null, content: part });
        part = "";
      }
      part += char;
    }
    if (part) return this.send({ type: `session.${kind}.append`, delegation_id: null, content: part });
    return false;
  }
  userText(text: string) {
    if (!this.send({ type: "response.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text }] } })) return false;
    this.requestResponse();
    return true;
  }
  requestResponse() {
    if (this.responseActive) { this.queuedResponse = true; return; }
    if (this.send({ type: "response.create" })) this.responseActive = true;
  }
  update(responses: Record<string, unknown>) {
    return new Promise<void>((resolve, reject) => {
      if (!this.ready || this.closing || this.disposed) { reject(new Error("Voice session is not ready.")); return; }
      const id = crypto.randomUUID();
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error("Voice configuration acknowledgment timed out.")); }, 10000);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ type: "session.update", event_id: id, session: { delegation: { type: "responses", responses } } });
    });
  }
  close() {
    if (!this.ready || this.closing || this.disposed) return;
    this.send({ type: "session.close" });
    this.closing = true;
  }
  dispose() {
    this.disposed = true;
    this.ready = false;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error("Voice session closed.")); }
    this.pending.clear();
  }
  receive(raw: string) {
    if (this.disposed) return;
    let message: Event;
    try { message = JSON.parse(raw); } catch { return; }
    if (!message || typeof message !== "object") return;
    if (message.event_id) {
      if (this.seenEvents.has(message.event_id)) return;
      this.seenEvents.add(message.event_id);
      if (this.seenEvents.size > 4096) this.seenEvents.delete(this.seenEvents.values().next().value!);
    }
    if (message.type === "session.started") { if (!this.ready) { this.ready = true; this.callbacks.ready(); } return; }
    if (message.type === "session.closed") { this.closing = true; this.callbacks.usage?.(message.usage?.seconds, undefined); this.callbacks.closed(message); return; }
    if (message.type === "session.usage.updated") { this.callbacks.usage?.(message.usage?.seconds, undefined); return; }
    if (message.type === "session.updated") {
      const pending = this.pending.get(message.client_event_id || "");
      if (pending) { clearTimeout(pending.timer); this.pending.delete(message.client_event_id!); pending.resolve(); }
      return;
    }
    if (message.type === "error") {
      const id = message.error?.client_event_id || "";
      const pending = this.pending.get(id);
      const error = new Error(message.error?.message || message.error?.code || "GPT-Live error");
      if (pending) { clearTimeout(pending.timer); this.pending.delete(id); pending.reject(error); }
      this.callbacks.diagnostic?.({ code: message.error?.code || "provider_error", client_event_id: id });
      if (["response_input_buffer_full", "function_call_outputs_required"].includes(message.error?.code || "")) {
        this.blockBackend(message.error!.code!);
        return;
      }
      this.responseActive = this.responses.size > 0;
      this.callbacks.error(error.message);
      return;
    }
    if (this.closing) return;
    if ((message.type === "session.input_transcript.delta" || message.type === "session.output_transcript.delta") && typeof message.delta === "string") {
      this.callbacks.transcript(message.type === "session.input_transcript.delta" ? "user" : "assistant", message.delta, message.start_ms || 0, message.end_ms || 0);
      return;
    }
    if (message.type === "session.delegation.created" && message.target === "responses" && message.delegation_id && message.response_id) {
      this.delegations.set(message.delegation_id, message.response_id);
      this.responseActive = true;
      return;
    }
    if (message.type !== "response.event" || !message.event || !message.delegation_id) return;
    const event = message.event;
    const delegation = message.delegation_id;
    if (event.type === "response.created" && event.response?.id) {
      this.delegations.set(delegation, event.response.id);
      if (!this.responses.has(event.response.id)) this.responses.set(event.response.id, { delegation, calls: new Map(), terminal: false });
      this.responseActive = true;
      return;
    }
    const id = event.response_id || event.response?.id || this.delegations.get(delegation);
    const response = id ? this.responses.get(id) : undefined;
    if (!response || response.delegation !== delegation || response.terminal) return;
    if (event.type === "response.output_item.done" && event.item?.type === "function_call" && event.item.name && event.item.call_id) {
      response.calls.set(event.item.call_id, event.item);
      return;
    }
    if (!["response.completed", "response.failed", "response.incomplete", "response.cancelled"].includes(event.type || "")) return;
    response.terminal = true;
    this.callbacks.usage?.(undefined, event.response?.usage);
    const calls = [...response.calls.values()];
    this.queue = this.queue.then(async () => {
      if (this.disposed || this.closing) return;
      if (event.type !== "response.completed") {
        this.callbacks.error("Voice backend did not complete. Pending actions were not retried.");
        this.responses.delete(id!);
        this.responseActive = this.responses.size > 0;
        return;
      }
      for (const item of calls) {
        if (this.disposed || this.closing || this.backendBlocked) return;
        const envelopeBytes = byteLength({ type: "function_call_output", call_id: item.call_id, output: "" });
        const outputBudget = Math.min(6000, INPUT_BYTE_BUDGET - this.inputBytes - envelopeBytes);
        if (this.inputItems >= INPUT_ITEM_BUDGET || outputBudget < 512) {
          this.blockBackend("input_budget_exhausted_before_tool");
          return;
        }
        let output = this.toolResults.get(item.call_id!);
        if (output === undefined) {
          try { output = boundedLiveToolOutput(await this.callbacks.runTool(item), outputBudget); }
          catch { output = JSON.stringify({ ok: false, error: "Tool execution failed; verify operation state before retrying." }); }
          this.toolResults.set(item.call_id!, output);
        }
        if (this.disposed || this.closing) return;
        if (!this.send({ type: "response.item.create", item: { type: "function_call_output", call_id: item.call_id, output } })) return;
        this.callbacks.diagnostic?.({ code: "tool_result_sent", input_bytes: this.inputBytes, input_items: this.inputItems });
      }
      this.responses.delete(id!);
      this.responseActive = this.responses.size > 0;
      if (calls.length || this.queuedResponse) { this.queuedResponse = false; this.requestResponse(); }
    }).catch(() => this.blockBackend("tool_result_delivery_failed"));
  }
}
