import path from 'node:path';
import { ExternalChatGateway } from '../external-gateway';
import type { TaskChatBackend, TaskChatBackendDriver, TaskProviderHealth, ProviderUsageView } from '../driver-types';
import { resolveTechscopeRoot,resolvePrithaStateRoot,resolvePrithaStatePath } from '../../pritha-paths';
import { getProviderSettings } from '../../settings/provider-settings-server';
import { getPrithaRuntimeSettings } from '../../realtime/pritha-runtime';
import { ClaudeProviderService } from '../../../../../../scripts/claude/provider-service.mjs';
import { startClaudeCodeRun } from '../../../../../../scripts/claude-code-runner.mjs';
import { normalizeCliItem,cliItemOriginalText } from '../normalize-cli';
import { parseBudgetIntent } from '../budget-intent';
import { CodexChatGatewayError } from '../native-gateway';

export class ClaudeDriver implements TaskChatBackendDriver {
  readonly connectorId='claude' as const;
  readonly backend:ExternalChatGateway;
  readonly service:ClaudeProviderService;
  constructor(attachments:TaskChatBackend['attachments']){
    const root=resolveTechscopeRoot(),stateRoot=resolvePrithaStateRoot(),privateRoot=resolvePrithaStatePath('private','task-chat');
    const executionDirectory=path.join(stateRoot===root?path.join(root,'.private'):stateRoot,'codex-chat','execution');
    const claudeBin=process.env.PRITHA_CLAUDE_CLI_BIN || 'claude';
    this.service=new ClaudeProviderService({root,stateRoot,privateRoot:path.join(privateRoot,'claude'),claudeBin});
    this.backend=new ExternalChatGateway(attachments,{connectorId:this.connectorId,root,stateRoot,privateRoot,executionDirectory,
      configuration:()=>({...getProviderSettings().providerPresets.claude,sandbox:getPrithaRuntimeSettings().codexSandbox==='read-only'?'read-only':'workspace-write'}),
      resolveConfiguration:preset=>this.service.resolveConfiguration(preset),
      preflight:async binding=>(await this.service.require(binding.executionConfig!)).capabilities,
      launch:options=>startClaudeCodeRun({...options,claudeBin}),
      validateText:text=>{if(parseBudgetIntent(text).kind!=='none')throw new CodexChatGatewayError('budget_control_required','Use the task budget control for budget changes.',422);},
      normalizeEvent:(attempt,event,binding)=>{const item=normalizeCliItem(attempt.chat+':'+attempt.turnId,event.item,binding.workspacePath,new Date().toISOString());return item?{item,originalText:cliItemOriginalText(event.item,item)}:null;},
    },(_modelId,preset)=>this.service.snapshot(preset || getProviderSettings().providerPresets.claude));
  }
  listThreads:TaskChatBackend['listThreads']=(...args)=>this.backend.listThreads(...args);
  getThreadHistory:TaskChatBackend['historyPage']=(...args)=>this.backend.historyPage(...args);
  startTurn:TaskChatBackend['startTurn']=(...args)=>this.backend.startTurn(...args);
  resumeTurn:TaskChatBackend['startTurn']=(...args)=>this.backend.startTurn(...args);
  cancelTurn:TaskChatBackend['controlTurn']=(...args)=>this.backend.controlTurn(...args);
  resolveApproval:TaskChatBackend['answerRequest']=(...args)=>this.backend.answerRequest(...args);
  async getRuntimeHealth(modelId?:string):Promise<TaskProviderHealth>{const preset=getProviderSettings().providerPresets.claude;const {models,model,...health}=await this.service.snapshot({...preset,...(modelId?{modelId}:{})});return health;}
  async getSettingsSnapshot(){return this.service.snapshot(getProviderSettings().providerPresets.claude);}
  previewRuntime:NonNullable<TaskChatBackendDriver['previewRuntime']>=preset=>this.backend.previewRuntime(preset);
  async getRateLimitsAndUsage():Promise<ProviderUsageView>{return {available:false,source:'unavailable',limits:null};}
}
