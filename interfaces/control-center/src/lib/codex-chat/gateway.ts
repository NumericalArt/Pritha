import { CodexAppServerDriver } from "./drivers/codex-app-server-driver";
import {normalizeChatSubject,normalizeFactoryIntent} from '../../../../../scripts/lib/chat-subject.mjs';
import { NeuralDeepDriver } from "./drivers/neuraldeep-driver";
import { ClaudeDriver } from "./drivers/claude-driver";
import { CompatibleDriver } from "./drivers/compatible-driver";
import { CodexChatGatewayError } from "./native-gateway";
import type { CreateThreadInput, CreateThreadWithFirstTurnInput } from "./native-gateway";
import type { TaskChatBackendDriver, TaskChatBackend, TaskProviderHealth } from "./driver-types";
import { PROVIDER_CONNECTOR_IDS, ProviderConfigurationError, isProviderConnectorId, normalizeProviderPreset, type ProviderConnectorId } from "../settings/provider-profile";
import { getProviderSettings } from "../settings/provider-settings-server";
import { providerThreadPage } from "./provider-thread-pages";
import { ProviderActivity } from "./provider-activity";
import { ProviderThreadRouting, ProviderRouteError } from "../../../../../scripts/lib/provider-thread-routing.mjs";
import { resolvePrithaStatePath, resolvePrithaStateRoot } from "../pritha-paths";
export { CodexChatGatewayError } from "./native-gateway";
export type { CreateThreadInput, StartTurnInput, CreateThreadWithFirstTurnInput } from "./native-gateway";

type Create = CreateThreadInput & { connectorId?: ProviderConnectorId };
type CreateWithTurn = CreateThreadWithFirstTurnInput & { connectorId?: ProviderConnectorId };
export type RuntimePreviewSelection={connectorId?:ProviderConnectorId;modelId?:string;effortId?:string;serviceTierId?:string};
function defaultDrivers():TaskChatBackendDriver[] {const native=new CodexAppServerDriver();return [native,new NeuralDeepDriver(native.backend.attachments),new ClaudeDriver(native.backend.attachments),new CompatibleDriver('openrouter',native.backend.attachments),new CompatibleDriver('local',native.backend.attachments)];}

/** HTTP/UI facade. Execution, native history and provider credentials live in drivers. */
export class CodexChatGateway {
  private readonly drivers = new Map<ProviderConnectorId, TaskChatBackendDriver>();
  private readonly activityMux: ProviderActivity;
  private readonly routes: ProviderThreadRouting;
  readonly attachments: TaskChatBackend["attachments"];
  constructor(drivers: TaskChatBackendDriver[] = defaultDrivers(), private readonly selection: () => ProviderConnectorId = () => getProviderSettings().activeConnectorId, routes?: ProviderThreadRouting) {
    for (const driver of drivers) {
      if (!isProviderConnectorId(driver.connectorId) || this.drivers.has(driver.connectorId)) throw new CodexChatGatewayError("provider_registry_invalid", "The task provider registry needs repair.", 503);
      this.drivers.set(driver.connectorId, driver);
    }
    this.attachments = this.driver("codex").backend.attachments;
    this.activityMux = new ProviderActivity(drivers);
    this.routes = routes || new ProviderThreadRouting({ stateRoot: resolvePrithaStateRoot(), directory: resolvePrithaStatePath("private", "task-chat", "routing") });
  }
  private driver(connectorId: ProviderConnectorId) {
    const driver = this.drivers.get(connectorId);
    if (!driver) throw new CodexChatGatewayError("provider_runtime_unavailable", "This provider runtime is unavailable. Review its settings before starting a task.", 503);
    return driver;
  }
  private selected(explicit?: ProviderConnectorId) {
    try {
      const id = explicit !== undefined ? explicit : this.selection();
      if (!isProviderConnectorId(id)) throw new CodexChatGatewayError("provider_profile_invalid", "Choose one of the configured task providers.", 400);
      return this.driver(id);
    } catch (error) {
      if (error instanceof ProviderConfigurationError) throw new CodexChatGatewayError(error.code, error.message, 503);
      throw error;
    }
  }
  private thread(chatId: string) {
    // New external IDs are namespaced. Legacy native IDs remain native forever,
    // including after changing the default provider. The backend verifies its binding.
    const namespace = /^chat_(codex|neuraldeep|claude|openrouter|local)_/.exec(chatId)?.[1];
    return this.driver((namespace || "codex") as ProviderConnectorId).backend;
  }
  async runtimeStatus(chatId?: string,selection?:RuntimePreviewSelection) {
    if(chatId){if(selection && Object.values(selection).some(value=>value!==undefined))throw new CodexChatGatewayError('runtime_identity_mismatch','Existing chats retain their original provider and model.',409);return this.thread(chatId).runtimeStatus(chatId);}
    const driver=this.selected(selection?.connectorId),connectorId=driver.connectorId;
    if(driver.previewRuntime){
      if(selection?.serviceTierId)throw new CodexChatGatewayError('provider_tier_unavailable','This provider does not expose native service tiers.',422);
      const preset=normalizeProviderPreset(connectorId,{...(selection?.modelId!==undefined?{modelId:selection.modelId}:{}),...(selection?.effortId!==undefined?{reasoningEffort:selection.effortId}:{})},getProviderSettings().providerPresets[connectorId]);
      return driver.previewRuntime(preset);
    }
    const status=await driver.backend.runtimeStatus();
    if(!selection)return {...status,connectorId};
    const preset=normalizeProviderPreset(connectorId,{...(selection.modelId!==undefined?{modelId:selection.modelId}:{}),...(selection.effortId!==undefined?{reasoningEffort:selection.effortId}:{})},getProviderSettings().providerPresets[connectorId]);
    const model=status.models.find(row=>row.id===preset.modelId),tier=selection.serviceTierId ?? status.selected.serviceTierId;
    const valid=Boolean(model && model.effortIds.includes(preset.reasoningEffort) && (!tier || model.serviceTierIds.includes(tier)));
    return {...status,connectorId,availability:valid?status.availability:'degraded' as const,selected:{...status.selected,modelId:preset.modelId,effortId:preset.reasoningEffort,serviceTierId:tier},providers:status.providers.map(row=>valid?row:{...row,warning:'Choose an available model, reasoning effort and service tier for this new chat.'})};
  }
  providerSettingsSnapshot(connectorId:ProviderConnectorId) {const driver=this.driver(connectorId);return driver.getSettingsSnapshot?.() || driver.getRuntimeHealth();}
  verifyProviderAttachments(connectorId:ProviderConnectorId,modelId:string,signal?:AbortSignal){
    const driver=this.driver(connectorId);
    if(!driver.verifyAttachments)throw new CodexChatGatewayError('provider_capability_unavailable','This provider does not offer local image verification.',422);
    return driver.verifyAttachments(modelId,{signal});
  }
  voiceTaskBackend(connectorId:ProviderConnectorId) {
    const backend=this.driver(connectorId).backend.voiceTaskBackend;
    if(!backend)throw new CodexChatGatewayError('provider_capability_unavailable','This provider uses its existing native voice task workflow.',422);
    return backend();
  }
  async providerHealth(): Promise<TaskProviderHealth[]> {
    return Promise.all(PROVIDER_CONNECTOR_IDS.map(async connectorId => {
      const driver = this.drivers.get(connectorId);
      if (driver) try {return await driver.getRuntimeHealth();} catch { /* A failed provider must not hide healthy siblings. */ }
      return { connectorId, status: "unavailable", version: null, checkedAt: new Date().toISOString(), error: { code: "provider_runtime_unavailable", message: "This provider runtime is not connected." }, capabilities: { steer: false, interrupt: false, approvals: false, tools: false, attachments: { files: false, images: false }, usage: "unavailable", resume: false, sandbox: "unavailable", offline: false } };
    }));
  }
  listThreads(input: Parameters<TaskChatBackend["listThreads"]>[0] = {}) {
    if (this.drivers.size === 1) return this.driver("codex").listThreads(input);
    return providerThreadPage([...this.drivers.values()], input);
  }
  private creationRoute(input: Create) {
    try {
      return this.routes.resolve({ clientThreadId: input.clientThreadId, connectorId: input.connectorId, modelId: input.settings?.modelId }, () => {
        const connectorId = this.selected(input.connectorId).connectorId;
        return { connectorId, modelId: getProviderSettings().providerPresets[connectorId].modelId || null };
      });
    } catch (error) {
      if (error instanceof ProviderRouteError) throw new CodexChatGatewayError(error.code, error.message, error.status);
      throw error;
    }
  }
  private validatePublicFactoryRequest(input:Create) {
    if(['voice','hostVoice'].some(key=>Object.hasOwn(input,key)) || input.workspace && ['factorySlug','factoryTarget'].some(key=>Object.hasOwn(input.workspace!,key)))
      throw new CodexChatGatewayError('factory_intent_invalid','Use Create new agent instead of supplying host workspace bindings.',400);
    return normalizeFactoryIntent(input.factoryIntent);
  }
  createThread(input: Create) {
    normalizeChatSubject(input.subject);
    const intent=this.validatePublicFactoryRequest(input);
    const route = this.creationRoute(input), { connectorId: _connectorId, ...request } = input;
    if(intent && route.connectorId==='codex')throw new CodexChatGatewayError('provider_capability_unavailable','Use the existing native agent workflow or select an external provider for Create new agent.',422);
    return this.driver(route.connectorId).backend.createThread({ ...request, settings: { ...request.settings, ...(route.modelId ? { modelId: route.modelId } : {}) } });
  }
  createThreadWithFirstTurn(input: CreateWithTurn) {
    normalizeChatSubject(input.subject);
    if (input.settings?.modelId && input.initialTurn.settings?.modelId && input.settings.modelId !== input.initialTurn.settings.modelId) throw new CodexChatGatewayError("runtime_identity_mismatch", "The first turn must use the chat's model.", 409);
    for(const field of ['effortId','serviceTierId'] as const)if(input.settings?.[field] && input.initialTurn.settings?.[field] && input.settings[field]!==input.initialTurn.settings[field])throw new CodexChatGatewayError('runtime_identity_mismatch','The first turn must use the chat’s execution settings.',409);
    const settings={...input.initialTurn.settings,...input.settings};
    const intent=this.validatePublicFactoryRequest(input);
    const route = this.creationRoute({ ...input, settings }), { connectorId: _connectorId, ...request } = input;
    if(intent && route.connectorId==='codex')throw new CodexChatGatewayError('provider_capability_unavailable','Use the existing native agent workflow or select an external provider for Create new agent.',422);
    return this.driver(route.connectorId).backend.createThreadWithFirstTurn({ ...request, settings: { ...settings, ...(route.modelId ? { modelId: route.modelId } : {}) } });
  }
  activity(after = 0) { return this.drivers.size === 1 ? this.driver("codex").backend.activity(after) : this.activityMux.read(after); }
  workspacePreview(connectorId?:ProviderConnectorId) { return this.selected(connectorId).backend.workspacePreview(); }
  async taskChatLinkForTask(taskId: string) {
    for (const driver of this.drivers.values()) { const found = await driver.backend.taskChatLinkForTask(taskId); if (found) return found; }
    return null;
  }
  async dispose() { try { await Promise.all([...this.drivers.values()].map(driver => driver.backend.dispose())); } finally { this.routes.close(); } }
  queuedMessages(...args: Parameters<TaskChatBackend["queuedMessages"]>) { return this.thread(args[0]).queuedMessages(...args); }
  enqueueMessage(...args: Parameters<TaskChatBackend["enqueueMessage"]>) { return this.thread(args[0]).enqueueMessage(...args); }
  cancelQueued(...args: Parameters<TaskChatBackend["cancelQueued"]>) { return this.thread(args[0]).cancelQueued(...args); }
  threadDetail(...args: Parameters<TaskChatBackend["threadDetail"]>) { return this.thread(args[0]).threadDetail(...args); }
  voiceControl(...args: Parameters<TaskChatBackend["voiceControl"]>) { return this.thread(args[0]).voiceControl(...args); }
  answerRequest(...args: Parameters<TaskChatBackend["answerRequest"]>) { return this.thread(args[0]).answerRequest(...args); }
  controlTurn(...args: Parameters<TaskChatBackend["controlTurn"]>) { return this.thread(args[0]).controlTurn(...args); }
  operationDecision(...args: Parameters<TaskChatBackend["operationDecision"]>) { return this.thread(args[0]).operationDecision(...args); }
  taskDeliveries(...args: Parameters<TaskChatBackend["taskDeliveries"]>) { return this.thread(args[0]).taskDeliveries(...args); }
  deliveryAction(...args: Parameters<TaskChatBackend["deliveryAction"]>) { return this.thread(args[0]).deliveryAction(...args); }
  applyDeliveryBudgetIntent(...args: Parameters<TaskChatBackend["applyDeliveryBudgetIntent"]>) { return this.thread(args[0]).applyDeliveryBudgetIntent(...args); }
  threadGoal(...args: Parameters<TaskChatBackend["threadGoal"]>) { return this.thread(args[0]).threadGoal(...args); }
  updateGoalBudget(...args: Parameters<TaskChatBackend["updateGoalBudget"]>) { return this.thread(args[0]).updateGoalBudget(...args); }
  applyBudgetIntent(...args: Parameters<TaskChatBackend["applyBudgetIntent"]>) { return this.thread(args[0]).applyBudgetIntent(...args); }
  archiveThread(...args: Parameters<TaskChatBackend["archiveThread"]>) { return this.thread(args[0]).archiveThread(...args); }
  restoreAccess(...args: Parameters<TaskChatBackend["restoreAccess"]>) { return this.thread(args[0]).restoreAccess(...args); }
  createTaskLink(...args: Parameters<TaskChatBackend["createTaskLink"]>) { return this.thread(args[0]).createTaskLink(...args); }
  historyPage(...args: Parameters<TaskChatBackend["historyPage"]>) { return this.thread(args[0]).historyPage(...args); }
  historyItems(...args: Parameters<TaskChatBackend["historyItems"]>) { return this.thread(args[0]).historyItems(...args); }
  historyContent(...args: Parameters<TaskChatBackend["historyContent"]>) { return this.thread(args[0]).historyContent(...args); }
  listTurns(...args: Parameters<TaskChatBackend["listTurns"]>) { return this.thread(args[0]).listTurns(...args); }
  startTurn(...args: Parameters<TaskChatBackend["startTurn"]>) { return this.thread(args[0]).startTurn(...args); }
  assertChat(...args: Parameters<TaskChatBackend["assertChat"]>) { return this.thread(args[0]).assertChat(...args); }
  subscribe(...args: Parameters<TaskChatBackend["subscribe"]>) { return this.thread(args[0]).subscribe(...args); }
  eventsAfter(...args: Parameters<TaskChatBackend["eventsAfter"]>) { return this.thread(args[0]).eventsAfter(...args); }
  connectionReady(...args: Parameters<TaskChatBackend["connectionReady"]>) { return this.thread(args[0]).connectionReady(...args); }
  heartbeat(...args: Parameters<TaskChatBackend["heartbeat"]>) { return this.thread(args[0]).heartbeat(...args); }
  streamReset(...args: Parameters<TaskChatBackend["streamReset"]>) { return this.thread(args[0]).streamReset(...args); }
}

declare global {
  // eslint-disable-next-line no-var
  var __prithaCodexChatGateway: CodexChatGateway | undefined;
  // eslint-disable-next-line no-var
  var __prithaCodexChatShutdownRegistered: boolean | undefined;
}
export function getCodexChatGateway() {
  if (!globalThis.__prithaCodexChatGateway) globalThis.__prithaCodexChatGateway = new CodexChatGateway();
  if (!globalThis.__prithaCodexChatShutdownRegistered) {
    globalThis.__prithaCodexChatShutdownRegistered = true;
    const dispose = () => { void globalThis.__prithaCodexChatGateway?.dispose(); };
    process.once("SIGTERM", dispose); process.once("SIGINT", dispose);
  }
  return globalThis.__prithaCodexChatGateway;
}
