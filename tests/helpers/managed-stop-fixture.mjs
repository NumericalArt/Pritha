import fs from 'node:fs';
import path from 'node:path';

// Deliberately small product fixture, independent from the protected verifier.
// The unsafe variation reproduces trusting a record PID while health matches.
export function managedFixtureHandler(){return `
const instance=process.argv[process.argv.indexOf('--managed-instance')+1];
const token=process.env.PRITHA_MANAGED_STOP_TOKEN;
function managed(req,res,server){
  if(req.url==='/health'){res.end(JSON.stringify({status:'ok',instance_id:instance,pid:process.pid}));return true;}
  if(req.url==='/stop'){
    let body='';req.on('data',c=>body+=c);req.on('end',()=>{
      const input=JSON.parse(body);
      if(input.instance_id!==instance || input.pid!==process.pid || input.stop_token!==token){res.writeHead(409);res.end();return;}
      res.end('{}',()=>{server.close();server.closeAllConnections();});
    });return true;
  }return false;
}
`;}

export function installStopFixture(root,portVariable,{unsafe=false}={}){
  const manifest=path.join(root,'operations/manifest.json');
  if(!fs.existsSync(manifest)){
    fs.mkdirSync(path.dirname(manifest),{recursive:true});
    fs.writeFileSync(manifest,JSON.stringify({service_mode:'process',control_center_managed:true,outcome_status:'implemented',control_center_contract:{status:'implemented'},
      start_command:{argv:['node','scripts/service-control.mjs','start']},stop_command:{argv:['node','scripts/service-control.mjs','stop']}}));
  }
  fs.writeFileSync(path.join(root,'scripts/service-control.mjs'),`
import fs from 'node:fs';import path from 'node:path';
const root=fs.realpathSync(process.cwd()),file=path.join(root,'.state/service.pid.json'),port=Number(process.env[${JSON.stringify(portVariable)}]);
try{
  if(!fs.existsSync(file))process.exit(0);
  const before=fs.readFileSync(file,'utf8'),r=JSON.parse(before);
  if(r.project_root!==root || r.server_path!==path.join(root,'scripts/server.mjs') || r.port!==port)throw Error('record mismatch');
  const h=await(await fetch('http://127.0.0.1:'+port+'/health',{signal:AbortSignal.timeout(500)})).json();
  if(h.instance_id!==r.instance_id ${unsafe?'':'|| h.pid!==r.pid'})throw Error('ownership mismatch');
  ${unsafe?"process.kill(r.pid,'SIGTERM');":`const response=await fetch('http://127.0.0.1:'+port+'/stop',{method:'POST',body:JSON.stringify(r),signal:AbortSignal.timeout(500)});if(!response.ok)throw Error('stop rejected');`}
  for(let i=0;i<100;i++){
    let listening=false;try{listening=(await fetch('http://127.0.0.1:'+port+'/health',{signal:AbortSignal.timeout(100)})).ok;}catch{}
    if(!listening){if(fs.readFileSync(file,'utf8')===before)fs.unlinkSync(file);process.exit(0);}
    await new Promise(r=>setTimeout(r,10));
  }throw Error('listener remained');
}catch(e){console.error(e.message);process.exitCode=1;}
`);
}
