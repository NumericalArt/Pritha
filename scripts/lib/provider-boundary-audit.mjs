import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const providers=['neuraldeep','claude','openrouter','local'];
const network={neuraldeep:['neuraldeep-responses-adapter','neuraldeep-owned-runner'],claude:['claude-api-proxy','claude-owned-runner','claude-native-auth','claude-native-tunnel'],openrouter:['compatible-responses-adapter','compatible-owned-runner'],local:['compatible-responses-adapter','compatible-owned-runner','owned-local-server']};
const common={secrets:['provider-credentials','agent-credential-store','provider-process-environment','redaction-encoded-input','redaction-paths'],network:['provider-process-environment','provider-sandbox','provider-host-tools']};
export function providerBoundaryAuditPlan({kind,connector='neuraldeep'}={}){
  if(!Object.hasOwn(common,kind)||!providers.includes(connector)&&connector!=='all')throw new Error('provider_boundary_audit_selection_invalid');
  const selected=connector==='all'?providers:[connector];
  const files=[...new Set([...common[kind],...(kind==='network'?selected.flatMap(id=>network[id]):selected.includes('claude')?['claude-native-auth']:[])])].map(name=>`tests/${name}.test.mjs`);
  return {schema:'pritha-provider-boundary-audit-v1',kind,connectors:selected,profile:'offline-synthetic',liveCredentialScan:'not-performed',liveProviderCalls:'not-performed',files};
}
export function runProviderBoundaryAudit(options){
  const plan=providerBoundaryAuditPlan(options);if(options.plan)return {...plan,status:'planned'};
  // No Keychain lookup, live key matching, real provider request or modification
  // of native auth. The ND proxy-only audit is replaced by real OS denial tests.
  const temporary=mkdtempSync(path.join(os.tmpdir(),'pritha-boundary-audit-'));
  let cleanup=true;
  try{
    const env=Object.fromEntries(['PATH','USER','LOGNAME','SHELL','TMPDIR','LANG','LC_ALL'].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]));
    env.HOME=temporary;
    const started=Date.now(),result=spawnSync(process.execPath,['--test','--test-concurrency=1','--test-reporter=tap',...plan.files],{cwd:root,env,encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024,killSignal:'SIGKILL'});
    cleanup=result.status!==null&&!result.signal&&!result.error;
    const output=String(result.stdout||'')+'\n'+String(result.stderr||'');
    const count=name=>Number(output.match(new RegExp(`^# ${name} (\\d+)\\s*$`,'m'))?.[1] ?? -1);
    const tests=count('tests'),passed=count('pass'),failed=count('fail'),skipped=count('skipped');
    const ok=result.status===0&&tests>0&&passed===tests&&failed===0&&skipped===0;
    return {...plan,status:ok?'pass':'fail',tests,passed,failed,skipped,exitCode:result.status,signal:result.signal,elapsedMs:Date.now()-started,diagnosticSha256:createHash('sha256').update(output).digest('hex'),...(!cleanup?{retainedAuditHome:temporary,recoveryRequired:true}:{})};
  }finally{if(cleanup)rmSync(temporary,{recursive:true,force:true});}
}
export function providerBoundaryAuditCli(kind,args=process.argv.slice(2)){
  try{
    if(args.includes('--help')){console.log('Offline boundary audit: [--connector neuraldeep|claude|openrouter|local|all] [--plan]. Uses synthetic credentials and real OS sandbox tests; does not verify live credentials.');return;}
    let connector='neuraldeep',plan=false;
    for(let index=0;index<args.length;index++){
      if(args[index]==='--plan')plan=true;
      else if(args[index]==='--connector'&&args[index+1])connector=args[++index];
      else throw new Error('provider_boundary_audit_selection_invalid');
    }
    const report=runProviderBoundaryAudit({kind,connector,plan});console.log(JSON.stringify(report,null,2));if(report.status==='fail')process.exitCode=1;
  }catch{console.error(JSON.stringify({status:'fail',error:'provider_boundary_audit_selection_invalid'}));process.exitCode=1;}
}
