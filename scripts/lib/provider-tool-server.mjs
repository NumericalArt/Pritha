import http from 'node:http';
import { randomBytes,timingSafeEqual } from 'node:crypto';
import { PROVIDER_HOST_TOOL_DEFINITIONS } from './provider-host-tools.mjs';

const versions=new Set(['2025-11-25','2025-06-18','2025-03-26']);
const object=value=>value!==null && typeof value==='object' && !Array.isArray(value);
const safeCode=error=>/^[a-z_]{1,80}$/.test(error?.code || '')?error.code:'provider_tool_failed';

/** Ephemeral, stateless MCP endpoint for one owned turn. Disconnecting an HTTP
 * request cannot cancel or repeat its host action: the tool receipt owns it. */
export async function listenProviderToolServer({hostTools,token=randomBytes(32).toString('base64url')}){
  if(typeof token!=='string' || token.length<32 || token.length>256)throw new Error('provider_tool_token_invalid');
  let closed=false,port;
  const authorized=request=>{
    const supplied=Buffer.from(request.headers.authorization || ''),expected=Buffer.from('Bearer '+token);
    return supplied.length===expected.length && timingSafeEqual(supplied,expected);
  };
  const server=http.createServer(async(request,response)=>{
    const send=(status,value)=>{if(!response.destroyed && !response.writableEnded){response.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});response.end(value===undefined?'':JSON.stringify(value));}};
    if(closed)return send(503);
    if(request.headers.host!=='127.0.0.1:'+port || request.headers.origin!==undefined || !authorized(request))return send(403);
    if(request.url!=='/mcp')return send(404);
    if(request.method!=='POST')return send(405);
    if(request.headers['mcp-protocol-version']!==undefined && !versions.has(request.headers['mcp-protocol-version']))return send(400);
    if(!/^application\/json(?:;|$)/i.test(request.headers['content-type'] || ''))return send(415);
    const declared=Number(request.headers['content-length'] || 0);if(!Number.isSafeInteger(declared) || declared>256000)return send(413);
    const deadline=setTimeout(()=>request.destroy(),10000);let value;
    try{let size=0;const chunks=[];for await(const chunk of request){size+=chunk.length;if(size>256000){send(413);request.destroy();return;}chunks.push(chunk);}value=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
    catch{return send(400);}finally{clearTimeout(deadline);}
    if(!object(value) || value.jsonrpc!=='2.0' || typeof value.method!=='string' || value.id!==undefined && !(typeof value.id==='string' && value.id.length<=128 || Number.isSafeInteger(value.id)))return send(400);
    if(value.id===undefined)return ['notifications/initialized','notifications/cancelled'].includes(value.method)?send(202):send(400);
    const answer=result=>send(200,{jsonrpc:'2.0',id:value.id,result});
    const error=(code,message)=>send(200,{jsonrpc:'2.0',id:value.id,error:{code,message}});
    if(value.method==='initialize'){
      if(!object(value.params) || !versions.has(value.params.protocolVersion))return error(-32602,'Unsupported protocol version');
      return answer({protocolVersion:value.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'pritha',version:'1.0.0'}});
    }
    if(value.method==='ping')return answer({});
    if(value.method==='tools/list')return answer({tools:PROVIDER_HOST_TOOL_DEFINITIONS});
    if(value.method!=='tools/call')return error(-32601,'Method unavailable');
    if(!object(value.params) || !PROVIDER_HOST_TOOL_DEFINITIONS.some(tool=>tool.name===value.params.name) || !object(value.params.arguments))return error(-32602,'Invalid tool request');
    try{answer(await hostTools.call(value.params.name,value.params.arguments));}
    catch(failure){answer({isError:true,content:[{type:'text',text:safeCode(failure)}]});}
  });
  server.headersTimeout=10000;server.requestTimeout=10000;server.maxHeadersCount=32;
  server.on('connect',(_req,socket)=>socket.destroy());server.on('upgrade',(_req,socket)=>socket.destroy());
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.off('error',reject);resolve();});});port=server.address().port;
  return {port,token,url:'http://127.0.0.1:'+port+'/mcp',async close(){if(closed)return;closed=true;const stopped=new Promise(resolve=>server.close(resolve));server.closeAllConnections();await stopped;}};
}
