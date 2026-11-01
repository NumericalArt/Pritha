import {createServer} from 'node:http';
import {createHash,timingSafeEqual} from 'node:crypto';
import {normalizeLocalProviderUrl} from '../lib/provider-profile.mjs';
import {ResponsesStreamNormalizer,writeResponseChunk} from '../neuraldeep/responses-stream.mjs';
import {normalizeNeuralDeepUsage,neuralDeepUsageKnown} from '../neuraldeep/usage-ledger.mjs';
import {OPENROUTER_BASE_URL,OPENROUTER_HEADERS,modelId} from './catalog.mjs';
import {toolProjection,projectProviderToolRequest,wireCall} from '../lib/provider-tool-projection.mjs';
const failure=(code,status=400)=>Object.assign(new Error('The selected provider request could not complete.'),{code,status});
const object=value=>value!==null && typeof value==='object' && !Array.isArray(value);
const digest=value=>createHash('sha256').update(value).digest();
const send=(response,status,body)=>{if(response.destroyed)return;response.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});response.end(JSON.stringify(body));};
const codeFor=status=>status===401 || status===403?'provider_pending_auth':status===402?'provider_billing_required':status===429?'provider_rate_limited':'provider_unavailable';
const safeCode=error=>/^provider_[a-z_]+$/.test(error?.code || '')?error.code:'provider_stream_invalid';
/** No provider routing hints, remote tools, URLs in media, or server-side history. */
export function compatibleRequest(input,{model,effort='default',maxOutputTokens=16384,thinkingBudget,reasoningControl,allowedTools}={}){
  if(!object(input) || input.model!==model)throw failure('provider_model_identity_mismatch');
  if(input.previous_response_id!=null || input.conversation!=null || input.store===true)throw failure('provider_stateful_request_unsupported');
  for(const field of ['models','provider','plugins','route','preset','background','web_search_options'])if(input[field]!=null && input[field]!==false)throw failure('provider_routing_disallowed');
  if(typeof input.input!=='string' && !Array.isArray(input.input))throw failure('provider_input_invalid');
  if(Array.isArray(input.input))for(const item of input.input){
    if(!object(item))throw failure('provider_input_invalid');
    if(!['message','function_call','function_call_output','reasoning','custom_tool_call','custom_tool_call_output',undefined].includes(item.type))throw failure('provider_input_unsupported');
    if(Array.isArray(item.content) && item.content.some(part=>!['input_text','output_text','refusal'].includes(part?.type)))throw failure('provider_attachment_unverified');
  }
  const projection=projectProviderToolRequest(input,allowedTools),toolInput=projection.payload;
  if(!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens<1 || maxOutputTokens>200000)throw failure('provider_output_limit_invalid');
  const result={model,input:toolInput.input,store:false,stream:true,max_output_tokens:Math.min(Number.isSafeInteger(input.max_output_tokens) && input.max_output_tokens>0?input.max_output_tokens:maxOutputTokens,maxOutputTokens)};
  for(const field of ['instructions','tools','tool_choice','parallel_tool_calls','text','include'])if(toolInput[field]!==undefined)result[field]=toolInput[field];
  // Host-pinned effort wins over arbitrary CLI defaults. A model without effort
  // control receives no effort field; mandatory reasoning is checked in preflight.
  if(effort!=='default' && (effort!=='none' || reasoningControl===true) || thinkingBudget!==undefined)result.reasoning={...(effort!=='default'?{effort}:{}),...(thinkingBudget!==undefined?{max_tokens:thinkingBudget}:{})};
  return result;
}

/** One capability-authenticated Responses endpoint per owned CLI attempt. The
 * upstream is selected by the host and can never be replaced by a request. */
export async function listenCompatibleAdapter(options){
  const {connectorId,localToken,model}=options;
  if(!['openrouter','local'].includes(connectorId) || !modelId(model) || !/^[A-Za-z0-9_-]{32,256}$/.test(localToken || ''))throw failure('provider_adapter_configuration_invalid');
  if(connectorId==='openrouter' && (!/^[\x21-\x7e]{1,8192}$/.test(options.apiKey || '') || options.baseUrl && options.baseUrl!==OPENROUTER_BASE_URL))throw failure('provider_adapter_configuration_invalid');
  if(connectorId==='local' && options.apiKey!==undefined)throw failure('provider_local_credentials_disallowed');
  const baseUrl=connectorId==='openrouter'?OPENROUTER_BASE_URL:normalizeLocalProviderUrl(options.baseUrl);
  const upstream=baseUrl+'/responses',tokenHash=digest('Bearer '+localToken),fetchImpl=options.fetchImpl || globalThis.fetch;
  const timeoutMs=options.timeoutMs ?? 900000,hardDeadlineAt=options.hardDeadlineAt ?? Date.now()+timeoutMs;
  if(!Number.isSafeInteger(timeoutMs) || timeoutMs<1 || timeoutMs>3600000 || !Number.isFinite(hardDeadlineAt))throw failure('provider_timeout_invalid');
  const requests=new Set(),controllers=new Set(),pending=new Set();let busy=false,closed=false;
  const server=createServer(async(request,response)=>{
    if(request.headers.origin || !timingSafeEqual(tokenHash,digest(String(request.headers.authorization || '')))){send(response,401,{error:{code:'provider_adapter_unauthorized',message:'A local task capability is required.'}});return;}
    if(request.url==='/v1/models' && request.method==='GET'){send(response,200,{models:[]});return;}
    if(request.url!=='/v1/responses' || request.method!=='POST'){send(response,404,{error:{code:'provider_adapter_endpoint_invalid',message:'This endpoint is unavailable.'}});return;}
    if(closed || busy){send(response,409,{error:{code:'provider_request_busy',message:'A provider request is already active.'}});return;}
    busy=true;const controller=new AbortController();controllers.add(controller);
    let settled;const settlement=new Promise(resolve=>{settled=resolve;});pending.add(settlement);
    let attempted=false,requestHash=null,usage=null,notified=false,terminal=null,errorCode=null,bytes=0;
    const timer=setTimeout(()=>controller.abort(failure('provider_timeout',504)),Math.max(1,Math.min(timeoutMs,hardDeadlineAt-Date.now())));
    const disconnect=()=>{if(!response.writableEnded)controller.abort(failure('provider_client_disconnect',499));};response.on('close',disconnect);
    const notify=async code=>{if(notified || (!attempted && !options.prepareRequest))return;notified=true;try{await options.onRequest?.({method:'POST',path:'/v1/responses',requestHash,upstreamAttempted:attempted,usage,usageKnown:usage!==null,responseBytes:bytes,...(code?{error:{code}}:{})});}catch{throw failure('provider_receipt_failed',503);}};
    try{
      if(Date.now()>=hardDeadlineAt)throw failure('provider_timeout',504);
      const chunks=[];let size=0;
      const iterator=request[Symbol.asyncIterator]();let inputAbort;
      const interrupted=new Promise((_,reject)=>{inputAbort=()=>reject(controller.signal.reason);controller.signal.addEventListener('abort',inputAbort,{once:true});});
      try{for(;;){if(controller.signal.aborted)throw controller.signal.reason;const {done,value}=await Promise.race([iterator.next(),interrupted]);if(done)break;size+=value.length;if(size>4*1024*1024)throw failure('provider_request_too_large',413);chunks.push(value);}}
      finally{controller.signal.removeEventListener('abort',inputAbort);if(!request.complete)response.once('finish',()=>request.destroy());}
      let input;try{input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,size)));}catch{throw failure('provider_input_invalid');}
      let payload=compatibleRequest(input,options);const projection=toolProjection(input.tools,options.allowedTools);requestHash=digest(JSON.stringify(payload)).toString('hex');
      if(options.prepareRequest)payload=await options.prepareRequest(payload,{requestHash});
      const body=JSON.stringify(payload);
      if(requests.has(requestHash))throw failure('provider_request_uncertain',409);
      if(requests.size>=1024)throw failure('provider_request_limit',409);
      await options.beforeRequest?.({requestHash,model,bytes:Buffer.byteLength(body)});
      if(controller.signal.aborted || Date.now()>=hardDeadlineAt)throw failure('provider_timeout',504);
      // Recorded before any payable network I/O; ambiguous failures never retry.
      requests.add(requestHash);attempted=true;
      const headers=new Headers({'content-type':'application/json',accept:'text/event-stream, application/json'});
      if(connectorId==='openrouter'){headers.set('authorization','Bearer '+options.apiKey);for(const [key,value] of Object.entries(OPENROUTER_HEADERS))headers.set(key,value);}
      const upstreamResponse=await fetchImpl(upstream,{method:'POST',headers,body,redirect:'error',signal:controller.signal,...(options.dispatcher?{dispatcher:options.dispatcher}:{})});
      if(!upstreamResponse.ok){await upstreamResponse.body?.cancel();throw failure(codeFor(upstreamResponse.status),upstreamResponse.status>=400 && upstreamResponse.status<=599?upstreamResponse.status:502);}
      if(!upstreamResponse.body)throw failure('provider_stream_invalid',502);
      if(Number(upstreamResponse.headers.get('content-length') || 0)>32*1024*1024){await upstreamResponse.body.cancel();throw failure('provider_response_too_large',502);}
      const validateTerminal=event=>{
        terminal=event;const value=event.response;
        if(value?.model && value.model!==model)throw failure('provider_model_identity_mismatch',502);
        if(options.allowedTools && value?.output?.some(item=>['function_call','custom_tool_call','local_shell_call'].includes(item.type) && ![...projection.map.values()].some(target=>target.name===item.name && target.namespace===item.namespace)))throw failure('provider_tool_identity_mismatch',502);
        usage=neuralDeepUsageKnown(value?.usage)?normalizeNeuralDeepUsage(value.usage):null;
      };
      response.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-store','x-accel-buffering':'no'});
      const normalizer=new ResponsesStreamNormalizer({write:chunk=>writeResponseChunk(response,chunk,controller.signal),onTerminal:validateTerminal,
        transform:raw=>{const event=JSON.parse(raw.slice(6));if(event.error)event.error={code:'provider_response_failed',message:'The provider response failed.'};if(event.response?.error)event.response.error={code:'provider_response_failed',message:'The provider response failed.'};
          if(options.allowedTools){if(event.item)event.item=wireCall(event.item,projection.map);if(Array.isArray(event.response?.output))event.response.output=event.response.output.map(item=>wireCall(item,projection.map));}
          return 'data: '+JSON.stringify(event)+'\n\n';}});
      if(upstreamResponse.headers.get('content-type')?.includes('text/event-stream')){
        for await(const chunk of upstreamResponse.body){bytes+=chunk.length;await normalizer.push(chunk);}
      }else{
        const chunks=[];for await(const chunk of upstreamResponse.body){bytes+=chunk.length;if(bytes>32*1024*1024)throw failure('provider_response_too_large',502);chunks.push(Buffer.from(chunk));}
        let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{throw failure('provider_stream_invalid',502);}
        if(!object(value) || !Array.isArray(value.output) || !['completed','incomplete','failed','cancelled'].includes(value.status))throw failure('provider_stream_invalid',502);
        await normalizer.push(Buffer.from('data: '+JSON.stringify({type:'response.'+value.status,response:value})+'\n\n'));
      }
      const events=normalizer.finish();
      if(options.allowedTools)for(const event of events){const items=[...(event.item?[event.item]:[]),...(event.response?.output || [])];
        if(items.some(item=>['function_call','custom_tool_call','local_shell_call'].includes(item.type) && ![...projection.map.values()].some(target=>target.name===item.name && target.namespace===item.namespace)))throw failure('provider_tool_identity_mismatch',502);}
      if(terminal?.type!=='response.completed' || terminal.response?.status && terminal.response.status!=='completed')throw failure(terminal?.response?.incomplete_details?.reason==='max_output_tokens'?'provider_output_limit':'provider_response_failed',502);
      await notify(null); // Commit usage before complete tools become executable.
      await normalizer.flush(events);response.end();
    }catch(error){
      errorCode=controller.signal.aborted?safeCode(controller.signal.reason):safeCode(error);
      try{await notify(errorCode);}catch{errorCode='provider_receipt_failed';}
      if(!response.headersSent)send(response,Number.isInteger(error.status) && error.status>=400 && error.status<=599?error.status:502,{error:{code:errorCode,message:'The selected provider request could not complete. No automatic retry was sent.'}});
      else if(!response.destroyed)response.end('data: '+JSON.stringify({type:'response.failed',response:{status:'failed',error:{code:errorCode,message:'The provider response did not complete.'},output:[]}})+'\n\n');
    }finally{clearTimeout(timer);response.off('close',disconnect);controllers.delete(controller);busy=false;pending.delete(settlement);settled();}
  });
  server.requestTimeout=Math.min(timeoutMs,30000);server.headersTimeout=Math.min(timeoutMs,30000);server.keepAliveTimeout=1000;
  server.on('connect',(_request,socket)=>socket.destroy());server.on('upgrade',(_request,socket)=>socket.destroy());
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const abort=()=>{for(const controller of controllers)controller.abort(failure('provider_cancelled'));};
  return {port:server.address().port,baseUrl:'http://127.0.0.1:'+server.address().port+'/v1',abort,close:async()=>{closed=true;abort();server.closeAllConnections();await Promise.all([new Promise(resolve=>server.close(resolve)),...pending]);}};
}
