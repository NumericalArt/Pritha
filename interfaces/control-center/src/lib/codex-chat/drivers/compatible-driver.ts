import path from 'node:path';
import {Agent} from 'undici';
import {ExternalChatGateway} from '../external-gateway';
import type {TaskChatBackend,TaskChatBackendDriver,TaskProviderHealth,ProviderUsageView} from '../driver-types';
import {resolveTechscopeRoot,resolvePrithaStateRoot,resolvePrithaStatePath} from '../../pritha-paths';
import {getProviderSettings} from '../../settings/provider-settings-server';
import {getPrithaRuntimeSettings} from '../../realtime/pritha-runtime';
import {CompatibleProviderService} from '../../../../../../scripts/openai-compatible/provider-service.mjs';
import {startCompatibleRun} from '../../../../../../scripts/openai-compatible-codex.mjs';
import {normalizeCliItem,cliItemOriginalText} from '../normalize-cli';
import {parseBudgetIntent} from '../budget-intent';
import {CodexChatGatewayError} from '../native-gateway';

/** Shared transport, distinct identity, saved configuration, credentials and history. */
export class CompatibleDriver implements TaskChatBackendDriver {
  readonly backend:ExternalChatGateway;
  readonly service:CompatibleProviderService;
  constructor(readonly connectorId:'openrouter'|'local',attachments:TaskChatBackend['attachments']){
    const root=resolveTechscopeRoot(),stateRoot=resolvePrithaStateRoot(),privateRoot=resolvePrithaStatePath('private','task-chat');
    const executionDirectory=path.join(stateRoot===root?path.join(root,'.private'):stateRoot,'codex-chat','execution');
    const codexBin=process.env.PRITHA_CODEX_CHAT_CLI_BIN || process.env.CODEX_BIN || 'codex';
    this.service=new CompatibleProviderService({connectorId,root,stateRoot,privateRoot:path.join(privateRoot,connectorId),codexBin});
    this.backend=new ExternalChatGateway(attachments,{connectorId,root,stateRoot,privateRoot,executionDirectory,
      configuration:()=>({...getProviderSettings().providerPresets[connectorId],sandbox:getPrithaRuntimeSettings().codexSandbox==='read-only'?'read-only':'workspace-write'}),
      preflight:async binding=>(await this.service.require(binding.executionConfig!)).capabilities,
      beforeRequest:binding=>this.service.require(binding.executionConfig),
      launch:async options=>{
        const dispatcher=new Agent({headersTimeout:options.timeoutMs,bodyTimeout:options.timeoutMs});
        try{const run=await startCompatibleRun({...options,connectorId,codexBin},{dispatcher});return {...run,completion:run.completion.finally(()=>dispatcher.close())};}
        catch(error){await dispatcher.close();throw error;}
      },
      validateText:text=>{if(parseBudgetIntent(text).kind!=='none')throw new CodexChatGatewayError('budget_control_required','Use the task budget control for budget changes.',422);},
      normalizeEvent:(attempt,event,binding)=>{const item=normalizeCliItem(attempt.chat+':'+attempt.turnId,event.item,binding.workspacePath,new Date().toISOString());return item?{item,originalText:cliItemOriginalText(event.item,item)}:null;},
    },(_modelId,preset)=>this.service.snapshot(preset || getProviderSettings().providerPresets[connectorId]));
  }
  listThreads:TaskChatBackend['listThreads']=(...args)=>this.backend.listThreads(...args);
  getThreadHistory:TaskChatBackend['historyPage']=(...args)=>this.backend.historyPage(...args);
  startTurn:TaskChatBackend['startTurn']=(...args)=>this.backend.startTurn(...args);
  resumeTurn:TaskChatBackend['startTurn']=(...args)=>this.backend.startTurn(...args);
  cancelTurn:TaskChatBackend['controlTurn']=(...args)=>this.backend.controlTurn(...args);
  resolveApproval:TaskChatBackend['answerRequest']=(...args)=>this.backend.answerRequest(...args);
  async getRuntimeHealth():Promise<TaskProviderHealth>{const {models,account,shortlist,endpoint,discovery,...health}=await this.service.snapshot(getProviderSettings().providerPresets[this.connectorId]);return health;}
  async getSettingsSnapshot(){return this.service.snapshot(getProviderSettings().providerPresets[this.connectorId]);}
  async getRateLimitsAndUsage():Promise<ProviderUsageView>{
    const snapshot=await this.service.snapshot(getProviderSettings().providerPresets[this.connectorId]),account=snapshot.account;
    return {available:account!==null,source:account?'provider':'unavailable',limits:account?{usageUsd:account.usageUsd,limitUsd:account.limitUsd,remainingUsd:account.remainingUsd,remainingSource:account.remainingSource,isFreeTier:account.isFreeTier}:null};
  }
}
