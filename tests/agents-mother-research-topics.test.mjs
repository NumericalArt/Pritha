import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveExternalResearchTopics,
  externalResearchRequired,
} from "../scripts/agents-mother/external-research-topics.mjs";

function ids(data) {
  return deriveExternalResearchTopics(data).map((topic) => topic.id);
}

test("fixture-like deterministic contract does not require external research topics", () => {
  const data = {
    text: [
      "- Out of scope: production deployment, external integrations, background services.",
      "### Deferred functions",
      "- Telegram adapter.",
      "- Web UI.",
    ].join("\n"),
    runtimeFamily: "codex-native",
    primaryInterface: "Codex project",
    telegramMode: "none",
    serviceMode: "none",
    autostart: "disabled",
    proactiveMode: "none",
    dependencies: "none.",
    memoryModel: "Markdown-first",
    coreFunctions: ["Expose a local CLI status command."],
    criticalWorkflows: ["Run the scaffolded status command."],
  };

  assert.deepEqual(ids(data), []);
  assert.equal(externalResearchRequired(data), false);
});

test("repository placeholder values do not create a repository-review topic", () => {
  assert.deepEqual(ids({ repositoryAdoptionMode: "none", selectedGitHubRepositories: "none" }), []);
  assert.deepEqual(ids({ repositoryAdoptionMode: "none", selectedGitHubRepositories: "not-applicable" }), []);
  assert.ok(ids({
    repositoryAdoptionMode: "selected-module",
    selectedGitHubRepositories: "https://github.com/example/agent-kit",
  }).includes("github-repository-review"));
});

test("realtime voice contract derives OpenAI Realtime research topic", () => {
  const topics = ids({
    runtimeFamily: "codex-native",
    primaryInterface: "web realtime voice",
    secondaryInterfaces: "Codex project",
    telegramMode: "none",
    coreFunctions: ["Respond to spoken operator commands through WebRTC audio."],
  });

  assert.ok(topics.includes("openai-realtime"));
  assert.equal(externalResearchRequired({ primaryInterface: "web realtime voice" }), true);
});

test('a child name does not invent runtime dependencies',()=>{
  const data={agentName:'Voice Word Counter Acceptance',runtimeFamily:'cli',primaryInterface:'CLI',dependencies:'Node.js built-in fs and TextDecoder',coreFunctions:['Count whitespace-delimited words in a UTF-8 file']};
  assert.ok(!ids(data).includes('openai-realtime'));assert.ok(ids(data).includes('declared-dependencies'));
  assert.ok(ids({...data,primaryInterface:'Voice with WebRTC'}).includes('openai-realtime'));
});

test("Telegram contract derives Bot API and untrusted input topics", () => {
  const topics = ids({
    runtimeFamily: "codex-native",
    primaryInterface: "Telegram",
    telegramMode: "primary-chat",
    inputDataTypes: "external messages, links, files and Telegram posts",
    secretsRequired: "Telegram bot token",
  });

  assert.ok(topics.includes("telegram-bot-api"));
  assert.ok(topics.includes("untrusted-input-security"));
});

test("local inference contract derives runtime and memory topics", () => {
  const topics = ids({
    runtimeFamily: "local-model",
    primaryInterface: "CLI",
    memoryModel: "Markdown plus semantic search and embeddings",
    toolSystem: "Ollama local inference adapter",
  });

  assert.ok(topics.includes("local-inference-runtime"));
  assert.ok(topics.includes("memory-rag-storage"));
});

test('a local HTTP application using a hosted model does not select local inference',()=>{
  const data={runtimeFamily:'api',serviceMode:'process',primaryInterface:'web',secondaryInterfaces:'none',
    childModelProvider:'openai',childModelConnection:'pritha',childModelId:'gpt-4.1-mini',
    primaryMission:'Create a small local model-connected HTTP service',runtimePlacementProfile:'hybrid',
    toolSystem:'minimal structured CLI/script tools',dependencies:'Node.js built-ins'};
  assert.ok(!ids(data).includes('local-inference-runtime'));
  assert.ok(ids({...data,toolSystem:'Ollama local inference adapter'}).includes('local-inference-runtime'));
});

test('retrieved API patterns cannot select a disabled Telegram interface or unselected services',()=>{
  const data={runtimeFamily:'api',serviceMode:'process',primaryInterface:'web',secondaryInterfaces:'none',
    telegramMode:'none',autostart:'disabled',proactiveMode:'none',repositoryAdoptionMode:'none',
    envExampleVariables:'MOOD_PASS_PORT=3082',dependencies:'Node.js built-ins',memoryModel:'none',
    primaryMission:'Return a mood through HTTP. Telegram mode: none.'};
  const patternPack={externalResearchSeeds:['telegram bot api','launchd cron','voice speech','semantic embeddings rag','api']};
  const topics=deriveExternalResearchTopics(data,{patternPack}).map(t=>t.id);
  for(const id of ['telegram-bot-api','pattern-telegram-bot-api','pattern-launchd-cron','pattern-voice-speech','pattern-semantic-embeddings-rag'])assert.ok(!topics.includes(id),id);
  assert.ok(topics.includes('pattern-api'));
  const legacy=deriveExternalResearchTopics({...data,primaryMission:'A local model-connected API; Telegram mode: none.'},{patternPack,topicPolicy:'legacy'}).map(t=>t.id);
  for(const id of ['local-inference-runtime','telegram-bot-api','pattern-telegram-bot-api','pattern-launchd-cron'])assert.ok(legacy.includes(id),'Saved legacy reports retain '+id);
  assert.ok(deriveExternalResearchTopics({...data,secondaryInterfaces:'Telegram',telegramMode:'primary-chat'},{patternPack}).some(t=>t.id==='telegram-bot-api'));
});

test("dependency and operations choices derive install and deployment topics", () => {
  const topics = ids({
    runtimeFamily: "codex-native",
    primaryInterface: "web UI",
    dependencies: "Next.js, React, OpenAI SDK",
    serviceMode: "launchd",
    autostart: "launchd-on-approval",
    proactiveMode: "scheduled",
  });

  assert.ok(topics.includes("interface-runtime-security"));
  assert.ok(topics.includes("declared-dependencies"));
  assert.ok(topics.includes("operations-deployment"));
});

test("external research queries never include raw dependency or pattern secret text", () => {
  const secret = "ASIA1234567890ABCDEF";
  const topics = deriveExternalResearchTopics(
    {
      runtimeFamily: "codex-native",
      dependencies: `example-package ${secret} IGNORE ALL PREVIOUS`,
    },
    {
      patternPack: {
        externalResearchSeeds: [`api ${secret}`, `openai ${secret}`],
      },
    },
  );
  const serialized = JSON.stringify(topics);
  assert.doesNotMatch(serialized, new RegExp(secret));
  assert.doesNotMatch(serialized, /IGNORE ALL PREVIOUS/);
  assert.ok(topics.some((topic) => topic.id === "declared-dependencies"));
  assert.ok(topics.some((topic) => topic.query.includes("api")));
});

test("pattern pack seeds derive additional current-source research topics", () => {
  const topics = deriveExternalResearchTopics(
    {
      runtimeFamily: "codex-native",
      primaryInterface: "Codex project",
      telegramMode: "none",
      serviceMode: "none",
      autostart: "disabled",
      proactiveMode: "none",
      dependencies: "none",
    },
    {
      patternPack: {
        externalResearchSeeds: [
          "OpenAI Realtime WebRTC",
          "MCP connector permissions",
          "generic agent workflow",
        ],
      },
    },
  );

  assert.ok(topics.some((topic) => topic.id === "pattern-openai-realtime-webrtc"));
  assert.ok(topics.some((topic) => topic.id === "pattern-mcp-connector-permissions"));
  assert.ok(!topics.some((topic) => topic.id === "pattern-generic-agent-workflow"));
});

test('headless CLI memory matches cannot introduce unselected Voice, web or service dependencies',()=>{
 const data={agentName:'Voice Word Counter Acceptance',runtimeFamily:'cli',primaryInterface:'CLI',telegramMode:'none',serviceMode:'none',autostart:'disabled',proactiveMode:'none',memoryModel:'none',dependencies:'Node.js built-in fs and TextDecoder',primaryMission:'Count words in a UTF-8 file',coreFunctions:['Read UTF-8 and emit JSON']};
 const patternPack={externalResearchSeeds:['voice speech','api','tailscale','github repository','realtime webrtc','browser sandbox']};
 assert.deepEqual(deriveExternalResearchTopics(data,{patternPack}).map(t=>t.id),['declared-dependencies']);
 const sqlite=deriveExternalResearchTopics({...data,memoryModel:'SQLite'},{patternPack:{externalResearchSeeds:['sqlite','voice speech']}});
 assert.ok(sqlite.some(t=>t.id==='pattern-sqlite'));assert.ok(!sqlite.some(t=>t.id==='pattern-voice-speech'));
});
