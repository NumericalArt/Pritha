import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { researchMarkdown, agentDevelopmentTaskMarkdown } from '../scripts/agents-mother/index.mjs';
import { patternPackMarkdown, verifyPatternPackIntegrity, logSemanticFailure } from '../scripts/agents-mother/pattern-research.mjs';
import { applyExternalResearchEvidence, verifyExternalResearchIntegrity } from '../scripts/agents-mother/external-research.mjs';
import { repositoryResearchMarkdown, repositoryResearchFrontmatter, verifyRepositoryResearchIntegrity } from '../scripts/agents-mother/github-research.mjs';
import { markdownDocumentLock } from '../scripts/lib/markdown-content-lock.mjs';
import { redactStructuredText } from '../scripts/lib/redaction.mjs';
const hostPath=path.join(path.sep,'Users','privacy-fixture','project'),privateHost=['fixture','ts','net'].join('.');
const sensitive=`Evidence from ${hostPath} and https://${privateHost}/secret; API_KEY=synthetic-secret-value`;
const noLeak=text=>{for(const value of [hostPath,privateHost,'synthetic-secret-value'])assert.equal(text.includes(value),false,value);};
const data={agentName:'Privacy Fixture',relPath:'contracts/synthetic.md',fingerprint:`sha256:${'a'.repeat(64)}`,primaryMission:sensitive,text:'- Current-docs verification required: no-with-reason: deterministic fixture.'};
const memory=[{type:'standard',status:'accepted',path:'04_standards/fixture.md',title:'Synthetic pattern',snippet:sensitive}];
const domains={agentBuildingKnowledge:[],prithaSelf:[],childAgents:[]};
const repository=()=>({plan:{required:false,policy:'auto',mode:'registry-only',limit:5,adoptionMode:'none',scopes:['agent-harness'],selectedRepositories:[],queries:[]},status:'complete',completedAt:new Date().toISOString(),onlineStatus:'not-applicable',queries:[],candidates:[],errors:[sensitive],registry:{ok:true}});
const skills={policy:{skillNeeds:'none',allowedSkillSources:'local',skillInstallMode:'none',skillMutationPolicy:'none'},installed:[],candidates:[],blocked:[]};

test('research and improve prose are redacted before the final document lock',()=>{
 const report=researchMarkdown(data,memory,domains,[],skills,{externalResearchTopics:[]});noLeak(report);
 assert.match(report,new RegExp(`research_content_lock: ${markdownDocumentLock(report)}`));
 const pack={relPath:'research/pattern.md',lock:'pending',semantic:{status:'skipped'},selectedPatterns:[],externalResearchSeeds:[]};
 const development=agentDevelopmentTaskMarkdown(hostPath,{...data,taskDescription:sensitive},{tools:[],surfaces:[]},{memoryResults:memory,domainResults:domains},pack,[],repository(),{task:sensitive});noLeak(development);
});
test('pattern Markdown and encoded payload are redacted before both locks',()=>{
 const pack=patternPackMarkdown(data,{memoryResults:memory,domainResults:domains,query:sensitive});noLeak(pack.text);
 const checked=verifyPatternPackIntegrity(pack.text,data.fingerprint);assert.equal(checked.ok,true,checked.reasons.join(','));noLeak(JSON.stringify(checked.payload));
});
test('semantic failure JSON redacts paths and identifiers while retaining valid structured values',t=>{
 const root=mkdtempSync(path.join(os.tmpdir(),'pritha-private-writer-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const file=logSemanticFailure(root,{status:'failed',reason:sensitive,stderr:sensitive});const text=readFileSync(path.resolve(root,file),'utf8');JSON.parse(text);noLeak(text);
 assert.deepEqual(redactStructuredText({exitCode:0,tokens_used:null,ok:true}),{exitCode:0,tokens_used:null,ok:true});
});
test('external evidence and synthesis are redacted before their encoded locks',()=>{
 const now=new Date().toISOString(),topics=[{id:'fixture',required:true}];
 const report='---\nid: privacy\ntype: review\nresearch_gate_status: pending\n---\n\n## External Research Evidence\n\n## Memory vs External Comparison\n\n## Architecture Recommendation\n';
 const result=applyExternalResearchEvidence(report,data,{backend:'manual',completed_at:now,items:[{topic_id:'fixture',source_url:'https://example.com/docs',source_type:'official-docs',source_updated:now,retrieved_at:now,claim:sensitive,evidence_summary:sensitive,confidence:'high'}],synthesis:{relationship:'confirms',memory_comparison:sensitive,summary:sensitive,architecture_decision:sensitive,alternatives:['Keep the existing bounded implementation'],tradeoffs:['maintenance']}},{topics});
 noLeak(result.text);const integrity=verifyExternalResearchIntegrity(result.text,topics);assert.equal(integrity.ok,true,integrity.reasons.join(','));noLeak(JSON.stringify(integrity));
});
test('repository Markdown and machine payload use the same sanitized projection',()=>{
 const research=repository();
 const text=`---\n${repositoryResearchFrontmatter(research)}\n---\n\n${repositoryResearchMarkdown(research)}`;noLeak(text);
 const checked=verifyRepositoryResearchIntegrity(text);assert.equal(checked.ok,true,checked.reasons.join(','));noLeak(JSON.stringify(checked));
});
