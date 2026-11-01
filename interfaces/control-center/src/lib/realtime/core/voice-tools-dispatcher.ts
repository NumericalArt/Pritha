/** Transport-neutral tool identities. Persisted OpenAI names remain aliases for
 * provider-neutral task wording; routing and approval stay in the host handlers. */
export const CORE_VOICE_TOOLS = [
  'full_pritha_memory', 'inspect_pritha_files', 'inspect_codex_task',
  'recall_rolling_summary', 'record_good_state_signal', 'answer_codex_task',
  'confirm_voice_intake', 'web_search', 'run_codex_task',
] as const;
export const EXTRA_VOICE_TOOLS = ['recent_external_research', 'music_control'] as const;
export type VoiceToolName = (typeof CORE_VOICE_TOOLS)[number] | (typeof EXTRA_VOICE_TOOLS)[number];
export type VoiceToolHandler = (args: Record<string, unknown>) => unknown | Promise<unknown>;
export type VoiceToolHandlers = Partial<Record<VoiceToolName, VoiceToolHandler>>;

const aliases: Record<string, VoiceToolName> = Object.freeze({
  inspect_voice_task: 'inspect_codex_task', answer_voice_task: 'answer_codex_task', run_voice_task: 'run_codex_task',
});
export function canonicalVoiceTool(name: unknown): VoiceToolName | null {
  if (typeof name !== 'string' || name.length > 64) return null;
  if (Object.hasOwn(aliases, name)) return aliases[name];
  return [...CORE_VOICE_TOOLS, ...EXTRA_VOICE_TOOLS].includes(name as VoiceToolName) ? name as VoiceToolName : null;
}

export async function dispatchVoiceTool(
  name: unknown,
  args: unknown,
  handlers: VoiceToolHandlers,
  options: { signal?: AbortSignal; allowedTools?: readonly VoiceToolName[] } = {},
) {
  const tool = canonicalVoiceTool(name);
  if (!tool) return { ok: false, error: 'unknown_tool' };
  if (options.signal?.aborted) return { ok: false, error: 'tool_interrupted' };
  if (options.allowedTools && !options.allowedTools.includes(tool)) return { ok: false, error: 'tool_not_available' };
  if (!args || typeof args !== 'object' || Array.isArray(args)) return { ok: false, error: 'invalid_tool_arguments' };
  const handler = Object.hasOwn(handlers, tool) ? handlers[tool] : undefined;
  if (!handler) return { ok: false, error: ['confirm_voice_intake', 'music_control'].includes(tool) ? 'client_tool_required' : 'tool_not_available' };
  // Check cancellation before dispatch only. A completed side effect must retain
  // its real receipt if the caller interrupts while that handler is finishing.
  return handler(args as Record<string, unknown>);
}
