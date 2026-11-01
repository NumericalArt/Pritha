import {SearchService} from '../../../../../scripts/search/service.mjs';
import {resolvePrithaRoot,resolvePrithaStateRoot} from '../pritha-paths';
import type {VoiceTaskSelection} from './session-context';
const services=new Map<string,SearchService>();
export function getNeuralDeepSearch(){
  const stateRoot=resolvePrithaStateRoot();let service=services.get(stateRoot);
  if(!service){service=new SearchService({stateRoot,codeRoot:resolvePrithaRoot()});services.set(stateRoot,service);}return service;
}
export async function neuralDeepVoiceSearch(args:Record<string,unknown>,host:{taskSelection:VoiceTaskSelection;searchTurnId?:string;explicitSearch?:boolean;searchDenied?:boolean;signal?:AbortSignal}){
  const service=getNeuralDeepSearch(),query=typeof args.query==='string'?args.query.trim():'',selection=host.taskSelection;
  const context={surface:'voice' as const,owner:selection.contextId,turn:host.searchTurnId || 'context_'+selection.contextId,connectorId:selection.connectorId,explicit:host.explicitSearch===true,denied:host.searchDenied===true,signal:host.signal};
  if(args.operation==='diagnose')return service.diagnose({kind:'quota'},context);
  const freshness=typeof args.freshness==='string' && ['any','current','day','week','month','year'].includes(args.freshness)?args.freshness:'any';
  return service.search({query,max_results:typeof args.max_results==='number'?args.max_results:5,domains:Array.isArray(args.domains)?args.domains:[],freshness,...(args.language?{language:args.language}:{})},context);
}
