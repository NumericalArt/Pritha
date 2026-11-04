import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceAuthority} from '../scripts/agents-mother/source-authority.mjs';
import {deriveExternalResearchTopics} from '../scripts/agents-mother/external-research-topics.mjs';
import {buildAgentDevelopmentQuery} from '../scripts/agents-mother/pattern-research.mjs';
test('canonical memory-derived topics retain bounded primary domains',()=>{
 const seeds=['openai realtime webrtc','mcp connector permissions','openai','realtime webrtc','voice speech','telegram bot api','mcp connector','semantic embeddings rag','sqlite','nextjs react','launchd cron','tailscale','oauth webhook','browser sandbox','codex','agents sdk','github repository','agent skills evals','api'];
 for(const seed of seeds){
  const topics=deriveExternalResearchTopics({primaryInterface:'Codex project'},{patternPack:{externalResearchSeeds:[seed]}});
  assert.equal(topics.length,1,seed);const authority=sourceAuthority(topics)[0];assert.ok(authority.primaryDomains.length,seed);
  assert.ok(authority.primaryDomains.every(d=>/^[a-z0-9.-]+$/.test(d)));assert.deepEqual(authority.primaryUrls,[]);
 }
 const voice=sourceAuthority([{id:'pattern-voice-speech',primaryDomains:['attacker.invalid']}])[0];assert.ok(voice.primaryDomains.includes('developer.mozilla.org'));assert.ok(!voice.primaryDomains.includes('attacker.invalid'));
 assert.deepEqual(sourceAuthority([{id:'unknown'}])[0].primaryDomains,[]);
 assert.deepEqual(sourceAuthority([{id:'mcp-provider'}])[0].primaryDomains,['modelcontextprotocol.io']);
});
test('a headless product name cannot bias capability research toward Voice',()=>{
 const data={agentName:'Voice Word Counter Acceptance',runtimeFamily:'cli',primaryInterface:'CLI',primaryMission:'Count whitespace-delimited words in a UTF-8 file',dependencies:'Node.js built-ins'};
 assert.doesNotMatch(buildAgentDevelopmentQuery(data),/Voice Word Counter/);assert.match(buildAgentDevelopmentQuery(data),/Count whitespace/);
 assert.match(buildAgentDevelopmentQuery({...data,primaryInterface:'web realtime voice'}),/Voice Word Counter/);
});
