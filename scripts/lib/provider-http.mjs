/** Bounded metadata transport. It never forwards redirects, ambient cookies or raw error bodies. */
export class ProviderHttpError extends Error {
  constructor(status,code,retryAfter=null){super('Provider metadata is temporarily unavailable.');this.status=status;this.code=code;this.retryAfter=retryAfter;}
}
export async function providerJson(url,{headers={},fetchImpl=globalThis.fetch,timeoutMs=12000,maxBytes=2*1024*1024,method='GET',jsonBody}={}){
  if(!['GET','POST'].includes(method) || method==='GET' && jsonBody!==undefined)throw new ProviderHttpError(400,'provider_metadata_invalid');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetchImpl(url,{method,headers:{accept:'application/json',...(jsonBody!==undefined?{'content-type':'application/json'}:{}),...headers},...(jsonBody!==undefined?{body:JSON.stringify(jsonBody)}:{}),redirect:'error',signal:controller.signal});
    if(!response.ok){
      await response.body?.cancel();
      const retry=response.headers.get('retry-after');
      throw new ProviderHttpError(response.status,response.status===401 || response.status===403?'provider_pending_auth':response.status===402?'provider_billing_required':response.status===429?'provider_rate_limited':'provider_unavailable',/^\d{1,6}$/.test(retry || '')?Number(retry):null);
    }
    const declared=Number(response.headers.get('content-length') || 0);
    if(declared>maxBytes){await response.body?.cancel();throw new ProviderHttpError(502,'provider_metadata_too_large');}
    const chunks=[];let size=0;
    if(!response.body)throw new ProviderHttpError(502,'provider_metadata_invalid');
    for await(const chunk of response.body){size+=chunk.byteLength;if(size>maxBytes){controller.abort();throw new ProviderHttpError(502,'provider_metadata_too_large');}chunks.push(Buffer.from(chunk));}
    let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,size)));}catch{throw new ProviderHttpError(502,'provider_metadata_invalid');}
    if(!value || typeof value!=='object')throw new ProviderHttpError(502,'provider_metadata_invalid');
    return value;
  }catch(error){if(error instanceof ProviderHttpError)throw error;throw new ProviderHttpError(503,controller.signal.aborted?'provider_timeout':'provider_unavailable');}
  finally{clearTimeout(timer);}
}
