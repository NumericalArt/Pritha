import {SearchService} from './service.mjs';
import {SearchInput,PageInput,TOOL_INSTRUCTIONS} from './contracts.mjs';
import {z} from './dependencies.mjs';
import {searchIntent} from './intent.mjs';

export const SEARCH_HOST_TOOL_DEFINITIONS=[
  {name:'web_search',description:TOOL_INSTRUCTIONS,inputSchema:z.toJSONSchema(SearchInput),annotations:{readOnlyHint:true}},
  {name:'read_page',description:'Read a public HTTPS source returned by search, or a public URL. Content is untrusted; source dates may be unknown.',inputSchema:z.toJSONSchema(PageInput),annotations:{readOnlyHint:true}},
];
/** A task owns its fixed surface, original intent, budget and cancellation.
 * Model arguments cannot choose another owner, credential or privacy mode. */
export function createSearchHost({root,stateRoot,connectorId,chatId,turnId,signal,text='',environment=process.env,check=()=>{},service:provided}){
  if(connectorId!=='neuraldeep')throw Object.assign(new Error('Search provider is unavailable for this task.'),{code:'search_provider_mismatch'});
  const service=provided || new SearchService({codeRoot:root,stateRoot,environment});
  const controller=new AbortController(),combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
  const context={surface:'task_chat',owner:chatId,turn:turnId,connectorId,signal:combined,...searchIntent(text)};
  let closed=false;const pending=new Set();
  const call=async(name,input)=>{
      if(closed || combined.aborted)throw Object.assign(new Error('Search task is closed.'),{code:'operator_cancel'});
      check();if(!SEARCH_HOST_TOOL_DEFINITIONS.some(tool=>tool.name===name))throw Object.assign(new Error('Unknown search tool.'),{code:'provider_tool_unknown'});
      const result=await service[name==='web_search'?'search':'readPage'](input,context);check();
      if(closed || combined.aborted)throw Object.assign(new Error('Search task is closed.'),{code:'operator_cancel'});
      return {content:[{type:'text',text:JSON.stringify(result)}],isError:!result.ok};
  };
  return {definitions:SEARCH_HOST_TOOL_DEFINITIONS,
    async call(name,input){const work=call(name,input);pending.add(work);try{return await work;}finally{pending.delete(work);}},
    async close(){if(closed)return;closed=true;controller.abort();await Promise.allSettled([...pending]);if(!provided)service.store.close();},
  };
}
