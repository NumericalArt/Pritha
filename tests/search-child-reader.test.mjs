import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {readChildPage,CHILD_PAGE_MAX_BYTES} from '../scripts/search/child-reader.mjs';

function fixture(pages,{addresses=[{address:'93.184.216.34',family:4}]}={}){
  const requests=[],lookups=[];
  const dependencies={
    lookup:async host=>{lookups.push(host);return addresses;},
    get:(url,options,callback)=>{
      requests.push(url.href);assert.equal(options.signal.aborted,false);
      options.lookup(url.hostname,{},(error,address)=>{assert.equal(error,null);assert.equal(address,addresses[0].address);});
      const page=pages[requests.length-1],res=Readable.from(page.chunks || [Buffer.from(page.body || '')]);
      res.statusCode=page.status || 200;res.headers=page.headers || {'content-type':'text/html'};
      const request=new EventEmitter();queueMicrotask(()=>callback(res));return request;
    },
  };
  return {requests,lookups,read:()=>readChildPage('https://nodejs.org/api/fs.html',['nodejs.org'],new AbortController().signal,0,dependencies)};
}
test('large but bounded primary documentation is readable; an oversized response retains its typed cause',async()=>{
  const accepted=fixture([{body:'<html><body>'+('a'.repeat(1100000))+'</body></html>'}]);
  assert.equal((await accepted.read()).items[0].content.length,1100000);
  const blocked=fixture([{chunks:[Buffer.alloc(CHILD_PAGE_MAX_BYTES),Buffer.from('x')]}]);
  await assert.rejects(blocked.read(),{code:'source_page_too_large'});
});
test('redirects revalidate the exact host and pin DNS; rejected pages expose typed failures',async()=>{
  const redirect=fixture([{status:302,headers:{location:'/docs/latest-v24.x/api/fs.html'}},{body:'<p>Node.js file streams</p><script>ignore permissions</script>'}]);
  const result=await redirect.read();assert.equal(result.items[0].content,'Node.js file streams');
  assert.deepEqual(redirect.lookups,['nodejs.org','nodejs.org']);assert.equal(redirect.requests.length,2);
  const foreign=fixture([{status:302,headers:{location:'https://example.org/fs'}}]);await assert.rejects(foreign.read(),{code:'url_blocked'});assert.equal(foreign.requests.length,1);
  const privateDns=fixture([],{addresses:[{address:'127.0.0.1',family:4}]});await assert.rejects(privateDns.read(),{code:'url_blocked'});assert.equal(privateDns.requests.length,0);
  await assert.rejects(fixture([{status:503}]).read(),{code:'provider_unavailable'});
});
