import { createServer } from 'node:http';
import { createHash,timingSafeEqual } from 'node:crypto';
import { once } from 'node:events';

const equal=(a,b)=>typeof a==='string' && Buffer.byteLength(a)===Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a),Buffer.from(b));
const error=(res,status,code)=>{if(res.destroyed)return;if(res.headersSent){res.destroy();return;}res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify({type:'error',error:{type:code,message:'The provider request could not be completed.'}}));};

/** A request-owned local capability. The stock CLI receives no account key. */
export async function listenClaudeApiProxy({localToken,apiKey,model,timeoutMs,maxOutputTokens=8192,allowedTools=[],beforeRequest,fetchImpl=globalThis.fetch}){
  if(typeof localToken!=='string' || localToken.length<32 || typeof apiKey!=='string' || !apiKey || !Number.isSafeInteger(timeoutMs) || timeoutMs<1 || timeoutMs>3600000
      || !Number.isSafeInteger(maxOutputTokens) || maxOutputTokens<1 || maxOutputTokens>128000 || allowedTools.length>64)throw new Error('provider_proxy_configuration_invalid');
  const controllers=new Set(),tools=new Set(allowedTools),requests=new Set();let fenced=false;
  const server=createServer({maxHeaderSize:16384},async(req,res)=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);controllers.add(controller);let dispatched=false;
    res.once('close',()=>{if(!res.writableEnded)controller.abort();});
    try{
      if(req.headers.origin || req.headers.host!==`127.0.0.1:${server.address().port}` || !equal(req.headers['x-api-key'] || req.headers.authorization,req.headers['x-api-key']?localToken:'Bearer '+localToken))return error(res,401,'authentication_error');
      if(req.method!=='POST' || !/^\/v1\/messages(?:\/count_tokens)?(?:\?beta=true)?$/.test(req.url || ''))return error(res,404,'not_found_error');
      const chunks=[];let bytes=0;
      for await(const chunk of req){bytes+=chunk.length;if(bytes>4*1024*1024)return error(res,413,'request_too_large');chunks.push(chunk);}
      let payload;try{payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,bytes)));}catch{return error(res,400,'invalid_request_error');}
      if(!payload || payload.model!==model || payload.mcp_servers || payload.tools && (!Array.isArray(payload.tools) || payload.tools.some(tool=>!tools.has(tool.name) || tool.type && tool.type!=='custom')))return error(res,400,'invalid_request_error');
      if(fenced)return error(res,409,'request_unconfirmed');
      if(!req.url.includes('/count_tokens'))payload.max_tokens=Math.min(Number.isSafeInteger(payload.max_tokens)&&payload.max_tokens>0?payload.max_tokens:maxOutputTokens,maxOutputTokens);
      if(controller.signal.aborted)return error(res,504,'timeout_error');await beforeRequest?.();
      if(controller.signal.aborted)return error(res,504,'timeout_error');
      const version=req.headers['anthropic-version'];if(!['2023-06-01','2026-10-21'].includes(version))return error(res,400,'invalid_request_error');
      const headers={'content-type':'application/json',accept:payload.stream?'text/event-stream':'application/json',authorization:'Bearer '+apiKey,'anthropic-version':version};
      const beta=req.headers['anthropic-beta'];if(typeof beta==='string' && beta.length<4096 && /^[A-Za-z0-9_,.-]+$/.test(beta))headers['anthropic-beta']=beta;
      if(!req.url.includes('/count_tokens')){
        const {stream,...request}=payload,fingerprint=createHash('sha256').update(JSON.stringify(request)).digest('hex');
        if(requests.has(fingerprint) || requests.size>=384)return error(res,409,'request_unconfirmed');requests.add(fingerprint);
      }
      dispatched=true;
      const response=await fetchImpl('https://api.anthropic.com'+req.url,{method:'POST',headers,body:JSON.stringify(payload),redirect:'error',signal:controller.signal});
      if(!response.ok){fenced=true;await response.body?.cancel();return error(res,[400,401,403,429,529].includes(response.status)?response.status:502,response.status===401 || response.status===403?'authentication_error':response.status===429?'rate_limit_error':'api_error');}
      if(!response.body){fenced=true;return error(res,502,'api_error');}
      res.writeHead(200,{'content-type':payload.stream?'text/event-stream':'application/json','cache-control':'no-store'});
      let total=0;
      for await(const chunk of response.body){total+=chunk.byteLength;if(total>128*1024*1024){controller.abort();throw new Error();}if(!res.write(Buffer.from(chunk)))await once(res,'drain',{signal:controller.signal});}
      res.end();
    }catch{if(dispatched)fenced=true;error(res,controller.signal.aborted?504:502,'api_error');}
    finally{clearTimeout(timer);controllers.delete(controller);}
  });
  server.on('connect',(_req,socket)=>socket.destroy());server.on('upgrade',(_req,socket)=>socket.destroy());
  server.listen(0,'127.0.0.1');await once(server,'listening');
  return {baseUrl:`http://127.0.0.1:${server.address().port}`,port:server.address().port,
    async close(){for(const controller of controllers)controller.abort();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
