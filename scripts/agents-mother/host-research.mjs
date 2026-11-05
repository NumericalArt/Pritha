import {createHash} from 'node:crypto';
import {existsSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {atomicWriteFile,atomicCompareAndSwapFile,withFileLock} from '../lib/atomic-file.mjs';
import {readBoundedRegularFile} from '../lib/safe-file-read.mjs';
import {privateStateFile,privateStateDirectory} from '../lib/private-state-path.mjs';
import {redactSensitiveText,quarantineUntrustedInstructionText,quarantineUntrustedSourcePassages} from '../lib/redaction.mjs';
import {SearchService} from '../search/service.mjs';
import {publicUrl,safeDate} from '../search/policy.mjs';
import {readChildPage} from '../search/child-reader.mjs';
import {rankedSourceQuotes} from './source-passages.mjs';
import {sourceAuthority} from './source-authority.mjs';
import {resolvePrithaAgentMemoryRoot} from '../lib/paths.mjs';
import {applyExternalResearchEvidence} from './external-research.mjs';

const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const fail=code=>{throw Object.assign(new Error('Host research needs review; collected evidence is preserved.'),{code});};
const errorCode=error=>/^[a-z_]{1,80}$/.test(error?.code||'')?error.code:'source_unavailable';
const read=(file,root)=>readBoundedRegularFile(file,{allowedRoots:[root],maxBytes:2*1024*1024}).text;
function allowed(url,domains){try{const host=new URL(publicUrl(url)).hostname;return domains.some(d=>host===d || host.endsWith('.'+d));}catch{return false;}}
function primaryResult(sources,topic){
  const generic=new Set(['current','official','documentation','docs','selected','agent','requires','declared','primary']);
  const terms=[...new Set(topic.query.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu)||[])].filter(term=>!generic.has(term));
  return sources.filter(source=>allowed(source.url,topic.primaryDomains)).map((source,index)=>({source,index,score:terms.reduce((n,term)=>n+Number(`${source.url} ${source.title||''} ${source.snippet||''}`.toLowerCase().includes(term)),0)})).filter(row=>row.score>0).sort((a,b)=>b.score-a.score || a.index-b.index)[0]?.source;
}
async function bounded(work,signal){signal.throwIfAborted();let abort;try{return await Promise.race([Promise.resolve().then(()=>{signal.throwIfAborted();return work();}),new Promise((_,reject)=>{abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});})]);}finally{signal.removeEventListener('abort',abort);}}
function passages(source){return rankedSourceQuotes(source.text,source.query).map(quote=>({id:hash([source.id,source.contentHash,quote]).slice(0,24),quote}));}
function sourceText(value,query){
  return rankedSourceQuotes(quarantineUntrustedSourcePassages(String(value || '').slice(0,2*1024*1024)),query).join('\n\n');
}

/** Private durable host operation. Provider/model messages never choose its identity,
 * source authorities, deadline, retry count or publication destination. */
export class HostResearch {
  constructor({root,stateRoot,data,report,patternLock,topics,connectorId='neuraldeep',service,reader=readChildPage,environment=process.env,totalMs=300000,sourceMs=20000,signal}){
    if(!['codex','neuraldeep','claude','openrouter','local'].includes(connectorId))fail('research_provider_invalid');
    if(!Number.isSafeInteger(totalMs) || totalMs<100 || totalMs>900000 || !Number.isSafeInteger(sourceMs) || sourceMs<50 || sourceMs>30000)fail('research_deadline_invalid');
    this.root=root;this.stateRoot=stateRoot;this.data=data;this.report=report;this.connectorId=connectorId;this.environment=environment;this.signal=signal;this.service=service;this.reader=reader;this.sourceMs=sourceMs;this.totalMs=totalMs;
    this.artifactRoot=resolvePrithaAgentMemoryRoot({root,stateRoot});
    if(!path.resolve(report.fullPath).startsWith(path.resolve(this.artifactRoot)+path.sep))fail('research_report_boundary');
    privateStateFile(stateRoot,report.fullPath);
    this.topics=sourceAuthority(topics);if(this.topics.length>12)fail('research_topic_limit');
    const directory=privateStateDirectory(stateRoot,path.join(stateRoot,stateRoot===root?'.private':'private','agents-mother','host-research'));
    this.binding=hash([realpathSync(stateRoot),data.fingerprint,hash(data.text),path.resolve(report.fullPath),patternLock,connectorId,this.topics,totalMs,sourceMs]);
    this.file=privateStateFile(stateRoot,path.join(directory,hash([data.fingerprint,report.fullPath,connectorId])+'.json'));
  }
  load(){
    privateStateFile(this.stateRoot,this.file);
    if(!existsSync(this.file))return null;
    let state;try{state=JSON.parse(read(this.file,this.stateRoot));}catch{fail('research_checkpoint_invalid');}
    if(state.schema!=='pritha-host-research-v1' || state.binding!==this.binding || !Array.isArray(state.sources) || !state.topics)fail('research_context_changed');
    for(const source of state.sources){
      const topic=this.topics.find(topic=>topic.id===source.topicId),retrieved=Date.parse(source.retrievedAt);
      if(!topic || hash(source.text)!==source.contentHash || !allowed(source.url,topic.primaryDomains) || !Number.isFinite(retrieved) || retrieved>Date.now()+300000 || Date.now()-retrieved>30*86400000)fail('research_source_stale');
    }
    return state;
  }
  save(state){privateStateFile(this.stateRoot,this.file);atomicWriteFile(this.file,JSON.stringify(state));}
  assertReport(state){privateStateFile(this.stateRoot,this.report.fullPath);const current=read(this.report.fullPath,this.artifactRoot);if(hash(current)!==state.reportHash)fail('research_report_changed');return current;}
  assertAllowed(){if(this.topics.length && (this.connectorId==='local' || this.environment.PRITHA_SEARCH_OFFLINE==='1'))fail('research_offline');this.signal?.throwIfAborted();}
  status(){
    const state=this.load();if(!state)return {status:'not-started',topics:this.topics,sources:[]};
    return {status:state.completed?'completed':state.sources.length===this.topics.length?'collected':'pending',deadlineAt:state.deadlineAt,recovery:state.recovery || null,topics:this.topics.map(topic=>({...topic,checkpoint:state.topics[topic.id] || null})),sources:state.sources.map(({text,query,...source})=>({...source,passages:passages({...source,text,query})}))};
  }
  async collect({retryFailed=false,sourceUrls={},recoverFailed=false}={}){
    this.assertAllowed();
    if(!sourceUrls || typeof sourceUrls!=='object' || Array.isArray(sourceUrls) || Object.keys(sourceUrls).some(id=>!this.topics.some(topic=>topic.id===id)))fail('research_sources_input_invalid');
    if(this.topics.some(topic=>!topic.primaryDomains.length))fail('research_source_authority_required');
    for(const [id,url] of Object.entries(sourceUrls))if(typeof url!=='string' || !allowed(url,this.topics.find(topic=>topic.id===id).primaryDomains))fail('research_primary_url_invalid');
    return withFileLock(this.file,async()=>{
      let state=this.load();
      if(recoverFailed){
        if(!state)fail('research_checkpoint_missing');
        if(Object.values(state.topics).some(attempt=>attempt.status==='started'))fail('research_source_unconfirmed');
        if(state.recovery){
          // A replay observes the first recovery. It never renews its deadline
          // or repeats a network effect, including after a lost response.
          const same=Object.keys(sourceUrls).length===Object.keys(state.recovery.sources).length && Object.entries(sourceUrls).every(([id,url])=>state.recovery.sources[id]===publicUrl(url));
          if(!same)fail('research_recovery_limit');
          return this.status();
        }
        this.assertReport(state);
        const failed=Object.entries(state.topics).filter(([,attempt])=>attempt.status==='failed');
        if(state.publication || !failed.length || Object.keys(sourceUrls).some(id=>state.topics[id] && state.topics[id].status!=='failed'))fail('research_recovery_unavailable');
        if(!Object.keys(sourceUrls).length)fail('research_recovery_unavailable');
        for(const [id,attempt] of failed){
          if(!sourceUrls[id] || publicUrl(sourceUrls[id])===attempt.url)fail('research_replacement_required');
        }
        // One new bounded window for confirmed failures with different sources.
        // The caller may also select sources for topics not reached yet, without
        // granting those topics extra retries or changing collected evidence.
        state.recovery={startedAt:new Date().toISOString(),previousDeadlineAt:state.deadlineAt,previousTopics:structuredClone(state.topics),sources:Object.fromEntries(Object.entries(sourceUrls).map(([id,url])=>[id,publicUrl(url)]))};
        state.deadlineAt=Date.now()+this.totalMs;
        retryFailed=true;
        this.save(state);
      }
      state ||= {schema:'pritha-host-research-v1',binding:this.binding,reportHash:hash(this.report.text),deadlineAt:Date.now()+this.totalMs,topics:{},sources:[]};
      if(state.publication)return this.status();this.assertReport(state);this.save(state);
      let ownedService;
      try{
        for(const topic of this.topics){
          this.assertAllowed();if(state.sources.some(source=>source.topicId===topic.id))continue;
          if(!topic.primaryDomains.length)fail('research_source_authority_required');
          if(Date.now()>=state.deadlineAt)fail('research_deadline_exceeded');
          const prior=state.topics[topic.id];
          if(prior?.status==='started')fail('research_source_unconfirmed');
          const recovered=state.recovery?.previousTopics[topic.id];
          const attemptLimit=recovered?.status==='failed'?recovered.attempts+2:2;
          if(prior && (!retryFailed || prior.attempts>=attemptLimit))fail(prior.attempts>=attemptLimit?'research_source_limit':'research_retry_required');
          const attempt=state.topics[topic.id]={attempts:(prior?.attempts||0)+1,status:'started',stage:'select',history:prior?[...(prior.history||[]),prior.error]:[]};this.save(state);
          const controller=new AbortController(),timer=setTimeout(()=>controller.abort(Object.assign(new Error('Source deadline reached.'),{code:'research_source_timeout'})),Math.min(this.sourceMs,state.deadlineAt-Date.now()));
          const signal=this.signal?AbortSignal.any([this.signal,controller.signal]):controller.signal;
          try{
            let url=sourceUrls[topic.id] || state.recovery?.sources[topic.id] || topic.primaryUrls[attempt.attempts-1] || topic.primaryUrls[0];
            let service=this.service;
            if(this.connectorId==='neuraldeep' && !service)service=ownedService ||=new SearchService({codeRoot:this.root,stateRoot:this.stateRoot,environment:this.environment});
            const context={owner:'research_'+this.data.fingerprint,turn:topic.id,surface:'research',connectorId:this.connectorId,explicit:true,signal};
            if(!url){
              if(!service)fail('research_primary_url_required');
              attempt.stage='search';this.save(state);
              const found=await bounded(()=>service.search({query:topic.query,domains:topic.primaryDomains,max_results:3,freshness:'current'},context),signal);
              attempt.searchReceipt={id:found.id,status:found.status,error:found.error?.code||null};this.save(state);
              if(!found.ok)fail(found.error?.code||'research_search_failed');
              url=primaryResult(found.sources,topic)?.url;
            }
            if(!url || !allowed(url,topic.primaryDomains))fail('research_primary_url_invalid');
            attempt.url=publicUrl(url);attempt.stage='read';this.save(state);
            // Authority admits reviewed domains and their subdomains. Give the
            // exact admitted host to the stricter DNS-pinned reader; redirects
            // still cannot introduce a different unlisted subdomain.
            const readHosts=[...new Set([...topic.primaryDomains,new URL(attempt.url).hostname])];
            const page=service?await bounded(()=>service.readPage({url:attempt.url,max_chars:20000},context),signal):await bounded(()=>this.reader(attempt.url,readHosts,signal),signal);
            signal.throwIfAborted();this.assertAllowed();this.assertReport(state);
            const item=service?page.sources?.find(source=>source.read===true && source.text && allowed(source.url,topic.primaryDomains)):page.items?.[0];
            if(service && !page.ok)fail(page.error?.code||'research_read_failed');
            if(!item || !allowed(item.url,topic.primaryDomains))fail('research_page_not_read');
            const text=sourceText(item.text || item.content,topic.query);
            const retrievedAt=service?item.retrieved_at:new Date().toISOString(),retrieved=Date.parse(retrievedAt);
            if(!Number.isFinite(retrieved) || retrieved>Date.now()+300000 || Date.now()-retrieved>30*86400000)fail('research_source_stale');
            const source={id:hash([topic.id,item.url,hash(text)]).slice(0,24),topicId:topic.id,url:publicUrl(item.url),title:quarantineUntrustedInstructionText(String(item.title||'').slice(0,500)),text,contentHash:hash(text),query:topic.query,retrievedAt,publishedAt:safeDate(item.published_at)||'unknown',untrusted:true};
            if(passages(source).reduce((total,item)=>total+Buffer.byteLength(item.quote),0)<80)fail('research_passage_missing');
            state.sources.push(source);attempt.status='completed';attempt.stage='complete';attempt.readReceipt=page.id || null;this.save(state);
          }catch(error){attempt.status='failed';attempt.error=errorCode(error);this.save(state);throw error;}
          finally{clearTimeout(timer);}
        }
        return this.status();
      }finally{ownedService?.store.close();}
    });
  }
  async publish(selection,{evaluateOverallGate,afterPrepared}={}){
    return withFileLock(this.file,async()=>{
      const state=this.load();if(!state)fail('research_checkpoint_missing');
      const selectionHash=hash(selection);
      if(state.publication){
        if(selectionHash!==state.publication.selectionHash)fail('research_selection_changed');
        privateStateFile(this.stateRoot,this.report.fullPath);
        const saved=state.publication,current=read(this.report.fullPath,this.artifactRoot);
        if(hash(saved.text)!==saved.hash)fail('research_checkpoint_invalid');
        if(hash(current)!==saved.hash){if(state.completed || hash(current)!==state.reportHash)fail('research_report_changed');atomicCompareAndSwapFile(this.report.fullPath,current,saved.text);}
        state.completed=true;this.save(state);return this.status();
      }
      const current=this.assertReport(state);
      if(!selection || !Array.isArray(selection.facts) || selection.facts.length>24 || state.sources.length!==this.topics.length)fail('research_selection_invalid');
      const seen=new Set(),items=selection.facts.map(fact=>{
        const source=state.sources.find(source=>source.id===fact.sourceId && source.topicId===fact.topicId),passage=source && passages(source).find(passage=>passage.id===fact.passageId);
        if(!passage || Object.hasOwn(fact,'quote') || seen.has(fact.passageId))fail('research_quote_unbound');seen.add(fact.passageId);
        const evidence=redactSensitiveText(passage.quote);
        return {topic_id:source.topicId,source_url:source.url,source_title:source.title,source_type:'official-docs',source_published:source.publishedAt,retrieved_at:source.retrievedAt,claim:evidence,evidence_summary:evidence,confidence:'medium',version_context:fact.versionContext,temporal_compatibility:fact.compatibility,temporal_compatibility_status:fact.compatibilityStatus};
      });
      const updated=applyExternalResearchEvidence(current,this.data,{backend:'host-primary-pages',items,synthesis:selection.synthesis},{topics:this.topics,evaluateOverallGate});
      if(updated.evidence.invalidCount || !updated.synthesis.complete || !updated.coverage.complete)fail('research_evidence_incomplete');
      state.publication={selectionHash,text:updated.text,hash:hash(updated.text)};this.save(state);await afterPrepared?.();
      atomicCompareAndSwapFile(this.report.fullPath,current,updated.text);state.completed=true;this.save(state);return this.status();
    });
  }
}
