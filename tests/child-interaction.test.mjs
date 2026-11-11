import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createHash,randomUUID} from 'node:crypto';
import {childInteractionDefinition,requestChildProduct} from '../scripts/lib/child-interaction.mjs';

test('first-use proxy sends to the approved path only after checking the owned process identity',async t=>{
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'pritha-interaction-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'.state'));fs.mkdirSync(path.join(root,'verification'));
  const content='const checks = JSON.parse('+JSON.stringify(JSON.stringify({http:[{path:'/run',input_json:{text:'hello'},expected_json:{answer:'world'}}]}))+');\n';
  const file=path.join(root,'verification/product.mjs');fs.writeFileSync(file,content);
  const outcome='- Verifier input: verification/product.mjs :: sha256:'+createHash('sha256').update(content).digest('hex')+' :: host-template:api-cli-product-v2';
  const definition=childInteractionDefinition(root,outcome);assert.deepEqual(definition.examples,[{text:'hello'}]);
  let requests=0;const instance=randomUUID();
  const server=http.createServer(async(req,res)=>{
    res.setHeader('content-type','application/json');
    if(req.url==='/health'){res.end(JSON.stringify({pid:process.pid,instance_id:instance}));return;}
    requests++;assert.equal(req.url,'/run');let body='';for await(const chunk of req)body+=chunk;res.end(JSON.stringify({answer:JSON.parse(body).text}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const port=server.address().port,record={pid:process.pid,instance_id:instance,project_root:root,server_path:path.join(root,'scripts/server.mjs'),port};
  const save=value=>fs.writeFileSync(path.join(root,'.state/service.pid.json'),JSON.stringify(value));save(record);
  const options={projectPath:root,upstream:'http://127.0.0.1:'+port,definition,input:{text:'  Unicode Я <script>  '}};
  assert.deepEqual((await requestChildProduct(options)).output,{answer:options.input.text});assert.equal(requests,1);
  save({...record,instance_id:'foreign'});await assert.rejects(requestChildProduct(options),{code:'agent_runtime_unverified'});assert.equal(requests,1);
  save({...record,project_root:'/different-child'});await assert.rejects(requestChildProduct(options),{code:'agent_runtime_unverified'});
  await assert.rejects(requestChildProduct({...options,upstream:'https://example.invalid'}),{code:'agent_endpoint_invalid'});
  fs.appendFileSync(file,'changed');assert.throws(()=>childInteractionDefinition(root,outcome),{code:'agent_verification_changed'});
});
