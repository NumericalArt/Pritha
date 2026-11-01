import { createHash,randomUUID } from 'node:crypto';
import { closeSync,constants,existsSync,fstatSync,fsyncSync,lstatSync,openSync,opendirSync,readFileSync,realpathSync,renameSync,rmSync,writeFileSync } from 'node:fs';
import path from 'node:path';
import { privateStateFile } from './private-state-path.mjs';
import { prepareProviderSandbox } from './provider-sandbox.mjs';
import { providerProcessEnvironment,createProviderTemporaryDirectory } from './provider-process-environment.mjs';
import { spawnSupervisedCli } from '../neuraldeep/process-supervisor.mjs';
import { resolvePrithaPython } from './python-runtime.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const validId=value=>typeof value==='string' && /^[A-Za-z0-9_-]{8,128}$/.test(value);
const object=value=>value!==null && typeof value==='object' && !Array.isArray(value);
const fail=code=>Object.assign(new Error('The host tool could not perform this operation within the task permissions.'),{code});
const denied=part=>/^(?:\.env(?:\..*)?|\.git|\.claude|\.codex|\.private|\.memory-private|\.queue|\.logs|\.ssh|\.aws|\.config|\.mcp\.json|\.?credentials\.json|id_rsa|id_ed25519)$/i.test(part);
const fields=(input,allowed)=>{if(!object(input) || Object.keys(input).some(key=>!allowed.includes(key)))throw fail('provider_tool_input_invalid');};
const text=value=>({content:[{type:'text',text:typeof value==='string'?value:JSON.stringify(value)}]});
const schema=(properties,required)=>({type:'object',properties,required,additionalProperties:false});
const string={type:'string'},operation={type:'string',description:'Stable operation ID; retain it when retrying the same action.'};
export const PROVIDER_HOST_TOOL_DEFINITIONS=[
  {name:'read_file',description:'Read a bounded UTF-8 window inside this task workspace. Returns the whole-file SHA-256 needed for a later edit.',inputSchema:schema({path:string,offset:{type:'integer',minimum:0},length:{type:'integer',minimum:1,maximum:24000}},['path']),annotations:{readOnlyHint:true}},
  {name:'list_files',description:'List one workspace directory; secrets and runtime state are excluded.',inputSchema:schema({path:string},['path']),annotations:{readOnlyHint:true}},
  {name:'write_file',description:'Propose one exact file write for operator approval. expected_sha256 must match the current file or be null for a new file. Never grants access outside the task sandbox.',inputSchema:schema({operation_id:operation,path:string,expected_sha256:{type:['string','null']},content:string},['operation_id','path','expected_sha256','content'])},
  {name:'run_command',description:'Propose an argv array for operator approval. The command runs in the task OS sandbox with no network and no host credentials. Use read_result to retrieve long output.',inputSchema:schema({operation_id:operation,argv:{type:'array',items:string,minItems:1,maxItems:64},timeout_ms:{type:'integer',minimum:1,maximum:120000}},['operation_id','argv'])},
  {name:'read_result',description:'Read a bounded window of a previous tool result from this exact turn.',inputSchema:schema({operation_id:operation,offset:{type:'integer',minimum:0},length:{type:'integer',minimum:1,maximum:24000}},['operation_id']),annotations:{readOnlyHint:true}},
  {name:'ask_user',description:'Ask one concise task question through Pritha. Do not ask for secrets or credentials.',inputSchema:schema({operation_id:operation,question:string},['operation_id','question'])},
];

/** All model-facing tools execute in this host, with a fixed workspace and an
 * immutable receipt. Model arguments never select a credential, root or policy. */
export class ProviderHostTools {
  constructor(options){this.options=options;this.cwd=realpathSync(options.cwd);this.pending=new Map();this.commands=new Set();this.serial=Promise.resolve();this.closed=false;this.exitConfirmed=true;this.calls=0;}
  check(){if(this.closed || this.options.signal?.aborted)throw fail('operator_cancel');this.options.lease.assertOwned();}
  target(relative,{directory=false,missing=false}={}){
    if(typeof relative!=='string' || relative.length>2048 || path.isAbsolute(relative) || relative.includes('\0') || relative.split(/[\\/]/).some(part=>part==='..' || denied(part)))throw fail('provider_tool_path_denied');
    const target=path.resolve(this.cwd,relative);if(target!==this.cwd && !target.startsWith(this.cwd+path.sep))throw fail('provider_tool_path_denied');
    let cursor=this.cwd;
    for(const part of path.relative(this.cwd,target).split(path.sep).filter(Boolean)){
      cursor=path.join(cursor,part);
      try{const info=lstatSync(cursor);if(info.isSymbolicLink() || (!info.isDirectory() && cursor!==target) || info.isFile() && info.nlink!==1)throw fail('provider_tool_path_denied');}
      catch(error){if(error.code==='ENOENT' && missing && cursor===target)return target;throw error.code==='ENOENT'?fail('provider_tool_file_missing'):error;}
    }
    const info=lstatSync(target);if(directory?!info.isDirectory():!info.isFile())throw fail('provider_tool_path_denied');return target;
  }
  read(file,max=2*1024*1024){
    const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);
    try{const info=fstatSync(fd);if(!info.isFile() || info.nlink!==1 || info.size>max)throw fail('provider_tool_file_too_large');return readFileSync(fd);}finally{closeSync(fd);}
  }
  window(value,input){const offset=input.offset ?? 0,length=input.length ?? 16000;if(!Number.isSafeInteger(offset) || offset<0 || !Number.isSafeInteger(length) || length<1 || length>24000)throw fail('provider_tool_input_invalid');return {text:value.slice(offset,offset+length),offset,nextOffset:offset+length<value.length?offset+length:null,totalCharacters:value.length};}
  resultPath(operationId){if(!validId(operationId))throw fail('provider_tool_input_invalid');return privateStateFile(this.options.stateRoot,path.join(this.options.privateRoot,'tool-results',hash(this.options.turnId),operationId+'.json'));}
  saved(operationId){const file=this.resultPath(operationId);if(!existsSync(file))throw fail('provider_tool_result_missing');try{return JSON.parse(this.read(file,20*1024*1024).toString('utf8'));}catch(error){throw error.code?error:fail('provider_tool_result_invalid');}}
  async call(name,input){
    this.check();if(++this.calls>10000)throw fail('provider_tool_call_limit');
    if(name==='read_file'){
      fields(input,['path','offset','length']);const bytes=this.read(this.target(input.path));let value;try{value=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw fail('provider_tool_binary_file');}
      return text({...this.window(value,input),sha256:hash(bytes)});
    }
    if(name==='list_files'){
      fields(input,['path']);const directory=opendirSync(this.target(input.path,{directory:true})),names=[];let row,scanned=0;
      try{while((row=directory.readSync()) && ++scanned<=10000 && names.length<=500)if(!denied(row.name) && !row.isSymbolicLink())names.push(row);}finally{directory.closeSync();}
      return text({files:names.slice(0,500).sort((a,b)=>a.name.localeCompare(b.name)).map(row=>({name:row.name,directory:row.isDirectory()})),truncated:Boolean(row)});
    }
    if(name==='read_result'){
      fields(input,['operation_id','offset','length']);const saved=this.saved(input.operation_id);return text({...this.window(saved.output,input),status:saved.status,exitCode:saved.exitCode ?? null});
    }
    if(!['write_file','run_command','ask_user'].includes(name))throw fail('provider_tool_unknown');
    if(!validId(input?.operation_id))throw fail('provider_tool_input_invalid');
    const key='provider-tool:'+this.options.turnId+':'+input.operation_id,requestHash=hash(JSON.stringify([name,input]));
    const existing=this.options.coordinator.getIntent(key);
    if(existing && existing.hash!==requestHash)throw fail('idempotency_conflict');
    if(this.pending.has(key))return this.pending.get(key);
    const promise=this.serial.then(()=>this.execute(key,requestHash,name,input));
    this.serial=promise.catch(()=>{});this.pending.set(key,promise);
    try{return await promise;}finally{this.pending.delete(key);}
  }
  async execute(key,requestHash,name,input){
    this.check();const coordinator=this.options.coordinator;
    const prior=coordinator.getIntent(key);
    if(prior?.state==='completed' || prior?.state==='declined'){const saved=this.saved(input.operation_id);return {...text({...this.window(saved.output,{}),status:saved.status,exitCode:saved.exitCode ?? null,operationId:input.operation_id}),isError:saved.status!=='completed'};}
    if(prior)throw fail('provider_tool_execution_unconfirmed');
    let presentation,kind,perform;
    if(name==='write_file'){
      fields(input,['operation_id','path','content','expected_sha256']);
      if(this.options.sandbox!=='workspace-write' || typeof input.content!=='string' || Buffer.byteLength(input.content)>24000 || input.expected_sha256!==null && !/^[a-f0-9]{64}$/.test(input.expected_sha256 || ''))throw fail('provider_tool_write_denied');
      const target=this.target(input.path,{missing:true}),before=existsSync(target)?hash(this.read(target)):null;
      if(before!==input.expected_sha256)throw fail('provider_tool_file_changed');
      kind='file_change_approval';presentation={path:input.path,beforeSha256:before,afterSha256:hash(input.content),proposedContent:input.content};
      perform=async()=>{
        this.check();const checked=this.target(input.path,{missing:true});if(checked!==target || (existsSync(checked)?hash(this.read(checked)):null)!==before)throw fail('provider_tool_file_changed');
        const temporary=path.join(path.dirname(target),'.pritha-write-'+randomUUID());
        const mode=existsSync(target)?lstatSync(target).mode&0o777:0o600;
        const fd=openSync(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,mode);
        try{writeFileSync(fd,input.content);fsyncSync(fd);}finally{closeSync(fd);}
        try{renameSync(temporary,target);}finally{rmSync(temporary,{force:true});}
        const directory=openSync(path.dirname(target),constants.O_RDONLY);try{fsyncSync(directory);}finally{closeSync(directory);}
        return {status:'completed',output:JSON.stringify({path:input.path,sha256:hash(input.content),bytes:Buffer.byteLength(input.content)})};
      };
    }else if(name==='run_command'){
      fields(input,['operation_id','argv','timeout_ms']);const argv=input.argv,timeout=input.timeout_ms ?? 60000;
      if(!Array.isArray(argv) || !argv.length || argv.length>64 || argv.some(value=>typeof value!=='string' || value.includes('\0')) || Buffer.byteLength(JSON.stringify(argv))>16000
          || !Number.isSafeInteger(timeout) || timeout<1 || timeout>120000)throw fail('provider_tool_input_invalid');
      let command;
      const choices=path.isAbsolute(argv[0])?[argv[0]]:argv[0].includes('/')?[this.target(argv[0])]:String(process.env.PATH || '').split(path.delimiter).filter(Boolean).map(dir=>path.join(dir,argv[0]));
      for(const candidate of choices)try{const info=lstatSync(realpathSync(candidate));if(info.isFile() && (info.mode&0o111)){command=realpathSync(candidate);break;}}catch{/* Try next explicit PATH entry. */}
      if(!command)throw fail('provider_tool_command_missing');
      kind='command_approval';presentation={command:argv,cwdLabel:'Task workspace',network:'disabled',sandbox:this.options.sandbox,timeoutMs:timeout};
      perform=()=>this.command(key,input.operation_id,command,argv.slice(1),timeout);
    }else{
      fields(input,['operation_id','question']);if(typeof input.question!=='string' || !input.question.trim() || input.question.length>2000)throw fail('provider_tool_input_invalid');
      kind='user_input';presentation={questions:[{id:'question_001',question:input.question,isSecret:false}]};perform=async response=>({status:'completed',output:JSON.stringify(response.answers)});
    }
    coordinator.reserveIntent(key,requestHash,{kind:'provider-tool',chatId:this.options.chatId,turnId:this.options.turnId,operationId:input.operation_id,tool:name,owner:this.options.lease.owner,generation:this.options.lease.generation});
    coordinator.updateIntent(key,{state:'approval_pending'});
    let result;
    try{
      const response=await this.options.approve({operationId:input.operation_id,kind,presentation,reason:name==='ask_user'?'The task needs your answer.':'Review the exact action before it runs in the task workspace.'});
      this.check();
      if(kind!=='user_input' && response.decision!=='accept')result={status:'declined',output:'The operator declined this action.'};
      else{coordinator.updateIntent(key,{state:'running'});result=await perform(response);}
    }catch(error){result={status:'failed',output:/^[a-z_]{1,80}$/.test(error.code || '')?error.code:'provider_tool_failed'};}
    const file=this.resultPath(input.operation_id),fd=openSync(file,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
    try{writeFileSync(fd,JSON.stringify(result));fsyncSync(fd);}finally{closeSync(fd);}
    coordinator.updateIntent(key,{state:result.status==='completed'?'completed':result.status==='declined'?'declined':'failed',resultFile:file,exitConfirmed:this.exitConfirmed});
    return {...text({...this.window(result.output,{}),status:result.status,exitCode:result.exitCode ?? null,operationId:input.operation_id}),isError:result.status!=='completed'};
  }
  async command(key,operationId,command,args,timeoutMs){
    const o=this.options,scratch=createProviderTemporaryDirectory({provider:o.connectorId,stateRoot:o.stateRoot});let plan;
    try{plan=prepareProviderSandbox({root:o.root,stateRoot:o.stateRoot,privateRoot:o.privateRoot,command,args,cwd:this.cwd,temporary:scratch,writeRoots:o.sandbox==='workspace-write'?[this.cwd]:[]});}catch(error){rmSync(scratch,{recursive:true,force:true});throw error;}
    const env=providerProcessEnvironment({provider:o.connectorId,root:o.root,stateRoot:o.stateRoot,temporary:scratch,env:{PATH:process.env.PATH,HOME:scratch}});env.PRITHA_PYTHON=resolvePrithaPython({root:o.root});
    let owned,timer,reason=null,exited=false;const stop=()=>{reason ||= 'operator_cancel';owned?.stop();};
    try{
      this.check();owned=await spawnSupervisedCli(plan.command,plan.args,{cwd:this.cwd,env,supervisorPath:path.join(o.root,'scripts','neuraldeep','process-supervisor.mjs'),beforeStart:proof=>{this.check();o.coordinator.updateIntent(key,{processProof:proof});o.onProcessEvidence?.(operationId,proof);},onEvidence:proof=>{o.coordinator.updateIntent(key,{processProof:proof});o.onProcessEvidence?.(operationId,proof);}});
      this.commands.add(owned);o.signal?.addEventListener('abort',stop,{once:true});if(o.signal?.aborted)stop();timer=setTimeout(()=>{reason='provider_tool_timeout';owned.stop();},timeoutMs);
      let bytes=0;const buffers=[];
      const read=async stream=>{for await(const chunk of stream){bytes+=chunk.length;if(bytes>16*1024*1024){reason='provider_output_limit';owned.stop();break;}buffers.push(Buffer.from(chunk));}};
      owned.child.stdin.end();const [done]=await Promise.all([owned.completion,read(owned.child.stdout),read(owned.child.stderr)]);exited=done.processTreeExited===true;if(!exited)this.exitConfirmed=false;
      return {status:!reason && done.code===0 && exited?'completed':'failed',exitCode:done.code,output:Buffer.concat(buffers).toString('utf8')+(reason?'\n'+reason:'')};
    }catch(error){owned?.stop();if(owned)exited=(await owned.completion).processTreeExited===true;else exited=error.processTreeExited!==false;if(!exited)this.exitConfirmed=false;throw error;}
    finally{clearTimeout(timer);o.signal?.removeEventListener('abort',stop);if(owned)this.commands.delete(owned);if(exited){rmSync(scratch,{recursive:true,force:true});rmSync(plan.planPath,{force:true});}}
  }
  async close(){this.closed=true;for(const owned of this.commands)owned.stop();await Promise.allSettled([...this.pending.values()]);return {processTreeExited:this.exitConfirmed};}
}
