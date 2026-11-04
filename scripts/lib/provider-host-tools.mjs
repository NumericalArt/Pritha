import { createHash,randomUUID } from 'node:crypto';
import { closeSync,constants,existsSync,fstatSync,fsyncSync,lstatSync,openSync,opendirSync,readFileSync,realpathSync,renameSync,rmSync,writeFileSync } from 'node:fs';
import path from 'node:path';
import { privateStateFile } from './private-state-path.mjs';
import { prepareProviderSandbox } from './provider-sandbox.mjs';
import { providerProcessEnvironment,createProviderTemporaryDirectory } from './provider-process-environment.mjs';
import { spawnSupervisedCli } from '../neuraldeep/process-supervisor.mjs';
import { resolvePrithaPython } from './python-runtime.mjs';
import {ProviderFactoryTools,PROVIDER_FACTORY_TOOL} from './provider-factory-tools.mjs';

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
  {name:'read_file',description:'Read a bounded UTF-8 window inside this task workspace or an attachment:<id> URI from this exact chat. Attachments are read-only; binary or large inputs return a verified snapshot path for an approved command. Workspace reads return the whole-file SHA-256 needed for a later edit.',inputSchema:schema({path:string,offset:{type:'integer',minimum:0},length:{type:'integer',minimum:1,maximum:24000}},['path']),annotations:{readOnlyHint:true}},
  {name:'list_files',description:'List one workspace directory; secrets and runtime state are excluded.',inputSchema:schema({path:string},['path']),annotations:{readOnlyHint:true}},
  {name:'write_file',description:'Propose one exact file write for operator approval. expected_sha256 must match the current file or be null for a new file. Never grants access outside the task sandbox.',inputSchema:schema({operation_id:operation,path:string,expected_sha256:{type:['string','null']},content:string},['operation_id','path','expected_sha256','content'])},
  {name:'edit_file',description:'Propose one exact text replacement in a file, including large files. old_text must occur exactly once and expected_sha256 must match the whole file.',inputSchema:schema({operation_id:operation,path:string,expected_sha256:string,old_text:string,new_text:string},['operation_id','path','expected_sha256','old_text','new_text'])},
  {name:'run_command',description:'Propose an argv array for operator approval. The command runs in the task OS sandbox with no network and no host credentials. Use read_result to retrieve long output.',inputSchema:schema({operation_id:operation,argv:{type:'array',items:string,minItems:1,maxItems:64},timeout_ms:{type:'integer',minimum:1,maximum:120000}},['operation_id','argv'])},
  {name:'read_result',description:'Read a bounded window of a previous tool result from this exact turn.',inputSchema:schema({operation_id:operation,offset:{type:'integer',minimum:0},length:{type:'integer',minimum:1,maximum:24000}},['operation_id']),annotations:{readOnlyHint:true}},
  {name:'ask_user',description:'Ask one concise task question through Pritha. Do not ask for secrets or credentials.',inputSchema:schema({operation_id:operation,question:string},['operation_id','question'])},
];

/** All model-facing tools execute in this host, with a fixed workspace and an
 * immutable receipt. Model arguments never select a credential, root or policy. */
export class ProviderHostTools {
  constructor(options){this.options=options;this.cwd=realpathSync(options.cwd);this.pending=new Map();this.commands=new Set();this.serial=Promise.resolve();this.closed=false;this.exitConfirmed=true;this.calls=0;this.commandCount=0;
    this.factory=options.factory?new ProviderFactoryTools(this):null;
    this.definitions=[...PROVIDER_HOST_TOOL_DEFINITIONS,...(options.search?.definitions || []),...(this.factory?[PROVIDER_FACTORY_TOOL]:[])];
    if(options.protectedPaths!==undefined && (!Array.isArray(options.protectedPaths) || options.protectedPaths.length>256))throw fail('provider_tool_policy_invalid');
    this.protectedPaths=(options.protectedPaths || []).map(value=>this.target(value));
  }
  check(){if(this.closed || this.options.signal?.aborted)throw fail('operator_cancel');this.options.lease.assertOwned();}
  target(relative,{directory=false,missing=false}={}){
    if(typeof relative!=='string' || relative.length>2048 || relative.startsWith('attachment:') || path.isAbsolute(relative) || relative.includes('\0') || relative.split(/[\\/]/).some(part=>part==='..' || denied(part)))throw fail('provider_tool_path_denied');
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
    if(name==='factory_step' && this.factory?.isRead(input))return text(this.factory.read(input));
    if(['web_search','read_page'].includes(name)){
      if(!this.options.search)throw fail('provider_tool_unknown');
      const result=await this.options.search.call(name,input);this.check();return result;
    }
    if(name==='read_file'){
      fields(input,['path','offset','length']);
      if(typeof input.path==='string' && input.path.startsWith('attachment:')){
        this.window('',input);if(!this.options.attachments)throw fail('attachment_not_in_chat');
        const {bytes,attachment}=await this.options.attachments.read(input.path);this.check();let value=null;
        if(this.options.connectorId==='claude' && attachment.kind==='image' && typeof this.options.attachments.imageContent==='function')return this.options.attachments.imageContent({bytes,attachment});
        if(bytes)try{value=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{/* Binary files remain exact bytes; no automatic extraction or conversion. */}
        return text({attachment,sha256:attachment.sha256,...(value===null?{text:'Binary or large attachment. Use its readOnlyPath with an explicitly approved run_command if this task requires processing it.',binary:true}:this.window(value,input))});
      }
      const bytes=this.read(this.target(input.path));let value;try{value=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw fail('provider_tool_binary_file');}
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
    if(!['write_file','edit_file','run_command','ask_user',...(this.factory?['factory_step']:[])].includes(name))throw fail('provider_tool_unknown');
    if(name==='factory_step')this.factory.validate(input);
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
    let presentation,kind,perform,alreadyApproved=false;
    if(name==='factory_step'){
      ({kind,presentation,perform,alreadyApproved=false}=this.factory.prepare(input));
    }else if(name==='write_file' || name==='edit_file'){
      fields(input,name==='write_file'?['operation_id','path','content','expected_sha256']:['operation_id','path','old_text','new_text','expected_sha256']);
      if(this.options.sandbox!=='workspace-write' || input.expected_sha256!==null && !/^[a-f0-9]{64}$/.test(input.expected_sha256 || ''))throw fail('provider_tool_write_denied');
      const target=this.target(input.path,{missing:name==='write_file'});if(this.protectedPaths.includes(target))throw fail('provider_protected_trial_input');
      const bytes=existsSync(target)?this.read(target):null,before=bytes?hash(bytes):null;let content=input.content;
      if(before!==input.expected_sha256)throw fail('provider_tool_file_changed');
      if(name==='edit_file'){
        if(typeof input.old_text!=='string' || !input.old_text || typeof input.new_text!=='string' || Buffer.byteLength(input.old_text)+Buffer.byteLength(input.new_text)>24000)throw fail('provider_tool_input_invalid');
        let original;try{original=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw fail('provider_tool_binary_file');}
        const offset=original.indexOf(input.old_text);if(offset<0 || original.indexOf(input.old_text,offset+1)>=0)throw fail('provider_tool_edit_ambiguous');
        content=original.slice(0,offset)+input.new_text+original.slice(offset+input.old_text.length);if(Buffer.byteLength(content)>2*1024*1024)throw fail('provider_tool_file_too_large');
      }else if(typeof content!=='string' || Buffer.byteLength(content)>24000)throw fail('provider_tool_input_invalid');
      kind='file_change_approval';presentation={path:input.path,beforeSha256:before,afterSha256:hash(content),...(name==='edit_file'?{oldText:input.old_text,newText:input.new_text}:{proposedContent:content})};
      perform=async()=>{
        this.check();const checked=this.target(input.path,{missing:true});if(checked!==target || (existsSync(checked)?hash(this.read(checked)):null)!==before)throw fail('provider_tool_file_changed');
        const temporary=path.join(path.dirname(target),'.pritha-write-'+randomUUID());
        const mode=existsSync(target)?lstatSync(target).mode&0o777:0o600;
        const fd=openSync(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,mode);
        try{writeFileSync(fd,content);fsyncSync(fd);}finally{closeSync(fd);}
        try{renameSync(temporary,target);}finally{rmSync(temporary,{force:true});}
        const directory=openSync(path.dirname(target),constants.O_RDONLY);try{fsyncSync(directory);}finally{closeSync(directory);}
        return {status:'completed',output:JSON.stringify({path:input.path,sha256:hash(content),bytes:Buffer.byteLength(content)})};
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
    coordinator.reserveIntent(key,requestHash,{kind:'provider-tool',chatId:this.options.chatId,turnId:this.options.turnId,operationId:input.operation_id,tool:name,owner:this.options.lease.owner,generation:this.options.lease.generation,...(name==='factory_step'?{factoryAction:input.action,factoryTarget:this.factory.paths.target,connectorId:this.options.connectorId}:{})});
    coordinator.updateIntent(key,{state:'approval_pending'});
    let result;
    try{
      const workflowAuthorized=name==='factory_step' && (alreadyApproved || this.factory.workflowAuthorized(input));
      const response=workflowAuthorized?{decision:'accept'}:await this.options.approve({operationId:input.operation_id,kind,presentation,reason:name==='ask_user'?'The task needs your answer.':name==='factory_step'?'Review this document and its limits. Contract approval, Outcome approval and final acceptance are separate decisions.':'Review the exact action before it runs in the task workspace.'});
      this.check();
      if(kind!=='user_input' && response.decision!=='accept')result={status:'declined',output:'The operator declined this action.'};
      else{coordinator.updateIntent(key,{state:'running',...(workflowAuthorized?{authorization:alreadyApproved?'existing-document-approval':'bound-creation-workflow'}:{})});result=await perform(response);}
    }catch(error){result={status:'failed',output:/^[a-z_]{1,80}$/.test(error.code || '')?error.code:'provider_tool_failed'};}
    const file=this.resultPath(input.operation_id),fd=openSync(file,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
    try{writeFileSync(fd,JSON.stringify(result));fsyncSync(fd);}finally{closeSync(fd);}
    coordinator.updateIntent(key,{state:result.status==='completed'?'completed':result.status==='declined'?'declined':'failed',resultFile:file,exitConfirmed:this.exitConfirmed});
    return {...text({...this.window(result.output,{}),status:result.status,exitCode:result.exitCode ?? null,operationId:input.operation_id}),isError:result.status!=='completed'};
  }
  async command(key,operationId,command,args,timeoutMs){
    if(++this.commandCount>128)throw fail('provider_tool_call_limit');
    const o=this.options,readOnlyRoots=await o.attachments?.readOnlyPaths() || [];this.check();
    const scratch=createProviderTemporaryDirectory({provider:o.connectorId,stateRoot:o.stateRoot});let plan;
    try{plan=prepareProviderSandbox({root:o.root,stateRoot:o.stateRoot,privateRoot:o.privateRoot,command,args,cwd:this.cwd,temporary:scratch,readOnlyRoots,writeRoots:o.sandbox==='workspace-write'?[this.cwd]:[],denyWriteRoots:this.protectedPaths});}catch(error){rmSync(scratch,{recursive:true,force:true});throw error;}
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
