import { createHash, randomUUID } from 'node:crypto';
import type { NextResponse } from 'next/server';
import { VoiceSessionContexts, VoiceContextError, type VoiceContext } from '../../../../../scripts/lib/voice-session-contexts.mjs';
import { nativeExecutionCoordinator } from '../codex-chat/native-turn-coordinator';
import { resolvePrithaStateRoot } from '../pritha-paths';
import { getProviderSettings } from '../settings/provider-settings-server';
import { requireVoiceEngine, VoiceEngineError } from '../realtime/voice-engine-server';
import { getPrithaRuntimeSettings } from '../realtime/pritha-runtime';
import { isVoiceModel, type PrithaVoiceId } from '../realtime/voice-settings';

export type VoiceTaskSelection = Pick<VoiceContext, 'connectorId' | 'preset' | 'serviceTier'> & { contextId: string };
const stores = new Map<string, VoiceSessionContexts>();
const cookieName = 'pritha-voice-owner';
function store() {
  const coordinator = nativeExecutionCoordinator();
  let current = stores.get(coordinator.file);
  if (!current) { current = new VoiceSessionContexts({ coordinator, stateRoot: resolvePrithaStateRoot() }); stores.set(coordinator.file, current); }
  return current;
}
export function voiceContextOwner(request: Request, create = false) {
  const supplied = request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  const token = /^[a-f0-9-]{36}$/.test(supplied || '') ? supplied! : create ? randomUUID() : null;
  if (!token) throw new VoiceContextError('voice_context_unavailable');
  const owner = createHash('sha256').update(resolvePrithaStateRoot() + ':' + token).digest('hex');
  return { token, owner };
}
export function setVoiceContextCookie(response: NextResponse, request: Request, token: string) {
  response.cookies.set(cookieName, token, { httpOnly: true, sameSite: 'strict', secure: new URL(request.url).protocol === 'https:', path: '/api', maxAge: 86400 });
}
export function openVoiceSessionContext(owner: string, engine: 'openai' | 'neuraldeep') {
  const selected = requireVoiceEngine(engine), settings = getProviderSettings(), native = getPrithaRuntimeSettings();
  if (selected.revision !== settings.revision) throw new VoiceContextError('voice_settings_changed');
  return store().create(owner, { connectorId: selected.connectorId, preset: settings.providerPresets[selected.connectorId], engine,
    voiceApi: engine === 'neuraldeep' ? 'neuraldeep' : native.voiceModel === 'gpt-live-1' ? 'live' : 'realtime',
    voiceModel: engine === 'neuraldeep' ? selected.chained.model : native.voiceModel,
    voice: engine === 'neuraldeep' ? selected.chained.voice : native.prithaVoice, serviceTier: native.codexServiceTier });
}
export function assertVoiceContextAllowed(context: VoiceContext, engine?: 'openai' | 'neuraldeep') {
  if (process.env.PRITHA_VOICE_OFFLINE === '1' || context.connectorId==='local') throw new VoiceEngineError('voice_offline', 'Cloud voice is disabled.');
  const saved = store().get(context.id, context.owner);
  if (engine && saved.engine !== engine) throw new VoiceContextError('voice_context_engine_mismatch');
  return saved;
}
export function getVoiceSessionContext(id: string, owner: string, engine?: 'openai' | 'neuraldeep') {
  return assertVoiceContextAllowed(store().get(id, owner), engine);
}
export function requestVoiceSessionContext(request: Request, id: unknown, engine?: 'openai' | 'neuraldeep') {
  if (typeof id !== 'string') throw new VoiceContextError('voice_context_unavailable');
  return getVoiceSessionContext(id, voiceContextOwner(request).owner, engine);
}
export function closeVoiceSessionContext(context: VoiceContext) { return store().close(context.id, context.owner); }
export function closeRequestVoiceSessionContext(request: Request, id: unknown) {
  if (typeof id !== 'string') throw new VoiceContextError('voice_context_unavailable');
  return store().close(id, voiceContextOwner(request).owner);
}
export function voiceTaskSelection(context: VoiceContext): VoiceTaskSelection {
  return { contextId: context.id, connectorId: context.connectorId, preset: { ...context.preset }, serviceTier: context.serviceTier };
}
export function voiceContextView(context: VoiceContext) {
  return { id: context.id, engine: context.engine, voiceApi: context.voiceApi, taskConnectorId: context.connectorId, taskModelId: context.preset.modelId };
}
export function nativeVoiceContextOptions(context: VoiceContext) {
  if (context.engine !== 'openai' || !isVoiceModel(context.voiceModel)) throw new VoiceContextError('voice_context_engine_mismatch');
  return { voiceModel: context.voiceModel, voice: context.voice as PrithaVoiceId };
}
