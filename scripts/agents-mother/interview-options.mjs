import path from 'node:path';
import {readBoundedRegularFile} from '../lib/safe-file-read.mjs';
import {parseInterviewBrief,interviewBriefOptions,INTERVIEW_PRESETS} from './interview-brief.mjs';
import {RUNTIME_FAMILIES,SERVICE_MODES,AUTOSTART_MODES,PROACTIVE_MODES,RUNTIME_PLACEMENT_PROFILES,TELEGRAM_MODES,BUILD_EXECUTORS,BUILD_GIT_MODES,TRIAL_BACKEND_POLICIES,REPOSITORY_RESEARCH_POLICIES,REPOSITORY_ADOPTION_MODES,parseRepositoryResearchTopics} from './contract.mjs';

/** Product decisions from the reviewed NeuralDeep brief/presets, retaining the
 * canonical native executor and independent Contract/Outcome approvals. */
export function prepareInterviewOptions(input={}){
  if(input.brief && input['from-brief'] && path.resolve(String(input.brief))!==path.resolve(String(input['from-brief'])))throw new Error('--brief and --from-brief refer to different files');
  const source=input.brief || input['from-brief'];let brief={};
  if(source){if(typeof source!=='string')throw new Error('Specify a brief file path');let text;try{text=readBoundedRegularFile(path.resolve(source),{maxBytes:128000}).text;}catch{throw new Error('Interview brief must be an accessible bounded regular file');}brief=interviewBriefOptions(parseInterviewBrief(text));}
  let options={...brief,...input},preset=options.preset || 'generic';
  if(!INTERVIEW_PRESETS.has(preset))throw new Error('Invalid interview preset. Expected: generic, local-feed, llm-app');
  if(options['source-format'] && !['json','rss','atom','mixed'].includes(options['source-format']))throw new Error('Invalid source format. Expected: json, rss, atom, mixed');
  if(preset!=='generic'){
    if(options.runtime && options.runtime!=='api' || options.service && options.service!=='process' || options.interface && !/^(web|api)$/i.test(options.interface))throw new Error('The selected preset requires api runtime, process service, and web/API interface');
    const base={runtime:'api',service:'process',interface:'web','runtime-placement':preset==='local-feed'?'deterministic-first':'hybrid','multi-model':'no','local-inference':'not-required','skill-needs':'none',
      fallbacks:'none; preserve saved data and offer explicit retry',memory:preset==='llm-app'?'SQLite':'local durable JSON records',stored:'Product records and selections; no provider credentials',inputs:'Declared external sources and explicit UI input',sensitive:'Product history stays local; credentials use separate child provisioning'};
    if(preset==='local-feed')Object.assign(base,{'repository-policy':'not-applicable','repository-topics':'none','repository-waiver':'The local-feed preset uses standard HTTP and feed processing; repository discovery is unnecessary. Runtime, source API and operations evidence remain required.'});
    options={...base,...options};
  }
  for(const [key,allowed] of Object.entries({runtime:RUNTIME_FAMILIES,service:SERVICE_MODES,autostart:AUTOSTART_MODES,proactive:PROACTIVE_MODES,'runtime-placement':RUNTIME_PLACEMENT_PROFILES,placement:RUNTIME_PLACEMENT_PROFILES,telegram:TELEGRAM_MODES,'build-executor':BUILD_EXECUTORS,'build-git-mode':BUILD_GIT_MODES,'trial-backend-policy':TRIAL_BACKEND_POLICIES,'repository-policy':REPOSITORY_RESEARCH_POLICIES,'repository-adoption':REPOSITORY_ADOPTION_MODES}))
    if(options[key]!==undefined && !allowed.has(options[key]))throw new Error('Invalid '+key+'. Expected: '+[...allowed].join(', '));
  if(options['repository-topics']){const parsed=parseRepositoryResearchTopics(options['repository-topics']);if(parsed.invalid.length || parsed.ambiguous)throw new Error('Invalid repository topics. Use documented scopes or one sentinel value');}
  if(options['repository-policy']==='not-applicable' && options['repository-adoption'] && options['repository-adoption']!=='none')throw new Error('not-applicable repository policy requires adoption mode none');
  if(options.slug && !/^[a-z0-9][a-z0-9-]{0,95}$/.test(options.slug))throw new Error('Technical slug must be bounded lowercase ASCII');
  if(options.port!==undefined && (!/^\d{1,5}$/.test(String(options.port)) || Number(options.port)<1 || Number(options.port)>65535))throw new Error('Port must be between 1 and 65535');
  if(options['port-variable'] && !/^[A-Z][A-Z0-9_]{0,63}_PORT$/.test(options['port-variable']))throw new Error('Port variable must be uppercase and end in _PORT');
  return options;
}
