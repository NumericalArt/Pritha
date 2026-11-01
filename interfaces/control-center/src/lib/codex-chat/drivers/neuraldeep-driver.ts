import path from 'node:path';
import { Agent } from 'undici';
import { ExternalChatGateway } from '../external-gateway';
import type { TaskChatBackend, TaskChatBackendDriver, TaskProviderHealth, ProviderUsageView } from '../driver-types';
import { resolveTechscopeRoot, resolvePrithaStateRoot, resolvePrithaStatePath } from '../../pritha-paths';
import { getProviderSettings } from '../../settings/provider-settings-server';
import { getPrithaRuntimeSettings } from '../../realtime/pritha-runtime';
import { NeuralDeepProviderService } from '../../../../../../scripts/neuraldeep/provider-service.mjs';
import { startNeuralDeepRun } from '../../../../../../scripts/neuraldeep-codex.mjs';
import { recordNeuralDeepRun } from '../../../../../../scripts/neuraldeep/usage-ledger.mjs';
import { normalizeCliItem, cliItemOriginalText } from '../normalize-cli';
import { parseBudgetIntent } from '../budget-intent';
import { CodexChatGatewayError } from '../native-gateway';

export class NeuralDeepDriver implements TaskChatBackendDriver {
  readonly connectorId='neuraldeep' as const;
  readonly backend:ExternalChatGateway;
  private readonly service:NeuralDeepProviderService;
  constructor(attachments:TaskChatBackend['attachments']){
    const root=resolveTechscopeRoot(),stateRoot=resolvePrithaStateRoot(),privateRoot=resolvePrithaStatePath('private','task-chat');
    const executionDirectory=path.join(stateRoot===root?path.join(root,'.private'):stateRoot,'codex-chat','execution');
    const codexBin=process.env.PRITHA_CODEX_CHAT_CLI_BIN || process.env.CODEX_BIN || 'codex';
    this.service=new NeuralDeepProviderService({root,stateRoot,privateRoot:path.join(privateRoot,'neuraldeep'),codexBin});
    this.backend=new ExternalChatGateway(attachments,{connectorId:this.connectorId,root,stateRoot,privateRoot,executionDirectory,
      configuration:()=>({...getProviderSettings().providerPresets.neuraldeep,sandbox:getPrithaRuntimeSettings().codexSandbox==='read-only'?'read-only':'workspace-write'}),
      preflight:binding=>this.service.require(binding.modelId!),beforeRequest:binding=>this.service.require(binding.modelId),
      launch:options=>startNeuralDeepRun({...options,codexBin},{createDispatcher:timeout=>new Agent({headersTimeout:timeout,bodyTimeout:timeout})}),
      validateText:text=>{if(parseBudgetIntent(text).kind!=='none')throw new CodexChatGatewayError('budget_control_required','Use the task budget control for budget changes.',422);},
      normalizeEvent:(attempt,event,binding)=>{const item=normalizeCliItem(attempt.chat+':'+attempt.turnId,event.item,binding.workspacePath,new Date().toISOString());return item?{item,originalText:cliItemOriginalText(event.item,item)}:null;},
      recordUsage:async(binding,attempt,result)=>{
        const row=this.backend.core.execution.getIntent(attempt.key),snapshot=await this.service.snapshot(binding.modelId);
        recordNeuralDeepRun({stateRoot,privateRoot:path.join(privateRoot,'neuraldeep'),runId:attempt.turnId,source:'codex-chat',workloadId:binding.chatId,
          model:binding.modelId,sessionId:result.sessionId,profileIdentity:attempt.identity,status:result.ok?'completed':'failed',usage:row?.providerUsage,usageKnown:row?.providerUsageKnown===true,
          providerRequests:row?.providerRequests || 0,cumulative:false,billing:snapshot.billing,startedAt:row?.createdAt,finishedAt:new Date().toISOString()});
      },
    },modelId=>this.getRuntimeHealth(modelId));
  }
  listThreads:TaskChatBackend['listThreads']=(...args)=>this.backend.listThreads(...args);
  getThreadHistory:TaskChatBackend['historyPage']=(...args)=>this.backend.historyPage(...args);
  startTurn:TaskChatBackend['startTurn']=(...args)=>this.backend.startTurn(...args);
  resumeTurn:TaskChatBackend['startTurn']=(...args)=>this.backend.startTurn(...args);
  cancelTurn:TaskChatBackend['controlTurn']=(...args)=>this.backend.controlTurn(...args);
  resolveApproval:TaskChatBackend['answerRequest']=(...args)=>this.backend.answerRequest(...args);
  async getRuntimeHealth(modelId?:string):Promise<TaskProviderHealth>{const {models,account,billing,...health}=await this.service.snapshot(modelId || getProviderSettings().providerPresets.neuraldeep.modelId);return health;}
  async getRateLimitsAndUsage():Promise<ProviderUsageView>{const snapshot=await this.service.snapshot(getProviderSettings().providerPresets.neuraldeep.modelId),limits=snapshot.account?.limits;
    return {available:Boolean(limits) && snapshot.account?.sections.limits.stale===false,source:limits?'provider':'unavailable',limits:limits?{parallelLimit:limits.parallelLimit,billingMode:limits.billingMode,canRequest:limits.decision.canRequest,sessionRemaining:limits.chat.session.remaining,weekRemaining:limits.chat.week.remaining,walletBalanceRub:limits.wallet?.balanceRub ?? null}:null};}
}
