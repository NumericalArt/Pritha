import {test,expect,type Page} from '@playwright/test';

const ids=['codex','neuraldeep','claude','openrouter','local'];
const labels={codex:'Codex',neuraldeep:'NeuralDeep',claude:'Claude Code',openrouter:'OpenRouter',local:'Local'};
const health=(connectorId:string)=>({connectorId,status:connectorId==='local'?'configured':'ready',version:'fixture',checkedAt:new Date().toISOString(),error:connectorId==='local'?{code:'provider_offline_unverified',message:'Network isolation has not been verified.'}:null,capabilities:{steer:false,interrupt:true,approvals:true,tools:true,attachments:{files:false,images:false},usage:'observed',resume:true,sandbox:'host-enforced',offline:false}});
const panel=(page:Page)=>page.locator('[data-testid="provider-settings"]:visible');
const select=async(page:Page,id:keyof typeof labels)=>{await panel(page).getByRole('tab',{name:new RegExp('^'+labels[id])}).click();};

for(const width of [390,1280])test(`NeuralDeep Search mode persists and rejects stale saves at ${width}px`,async({page,request})=>{
  const endpoint='/api/task-runtime/providers/neuraldeep/search';
  const original=(await(await request.get(endpoint)).json()).settings;
  try{
    await page.setViewportSize({width,height:900});await page.goto('/settings');await select(page,'neuraldeep');const surface=panel(page),mode=surface.getByLabel('NeuralDeep Search mode',{exact:true});
    await expect(mode).toBeEnabled();await mode.selectOption(original.mode==='requested'?'auto':'requested');await surface.getByRole('button',{name:'Save search mode',exact:true}).click();await expect(surface).toContainText('Search mode saved.');
    const current=(await(await request.get(endpoint)).json()).settings;expect(current.mode).not.toBe(original.mode);
    expect((await request.post(endpoint,{data:{mode:'off',expectedRevision:current.revision}})).ok()).toBe(true);
    await mode.selectOption('auto');if(current.mode==='auto')await mode.selectOption('requested');
    await surface.getByRole('button',{name:'Save search mode',exact:true}).click();await expect(surface).toContainText('Search settings changed elsewhere.');
    await surface.getByRole('button',{name:'Reload search mode',exact:true}).click();await expect(mode).toHaveValue('off');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }finally{const saved=(await(await request.get(endpoint)).json()).settings;expect((await request.post(endpoint,{data:{mode:original.mode,expectedRevision:saved.revision}})).ok()).toBe(true);}
});
async function fixtures(page:Page){
  await page.route('**/api/task-runtime/providers',route=>route.fulfill({json:{ok:true,providers:ids.map(health)}}));
  await page.route(/\/api\/task-runtime\/providers\/[^/?]+$/,async route=>{
    const id=new URL(route.request().url()).pathname.split('/').at(-1)!;
    if(route.request().method()==='POST')return route.fulfill({json:{ok:true,stored:true}});
    const models=(id==='openrouter'?['vendor/alpha','vendor/beta']:id==='claude'?['claude-fixture']:id==='local'?['local-fixture']:['nd-fixture']).map(id=>({id,efforts:['default','none','low','medium','high','xhigh'],contextTokens:32768,outputTokens:8192,tools:true,thinkingBudget:true}));
    return route.fulfill({json:{ok:true,credentials:{configured:false,status:'missing',source:'macos_keychain',maskedValue:''},provider:{...health(id),models,shortlist:id==='openrouter'?models.map(({id})=>({id,available:true})):[],account:id==='openrouter'?{usageUsd:4,limitUsd:null,remainingUsd:null,isFreeTier:false}:id==='neuraldeep'?{limits:{billingMode:'subscription',parallelLimit:2,wallet:{balanceRub:10}}}:null,discovery:id==='local'?[{endpoint:'http://127.0.0.1:11434/v1',status:'reachable',models}]:[]}}});
  });
}
test.beforeEach(async({page,request})=>{
  expect(process.env.PRITHA_E2E_ISOLATED_STATE).toBe('1');await fixtures(page);
  let settings=(await(await request.get('/api/task-runtime/settings')).json()).settings;
  for(const connectorId of ['openrouter','claude']){
    const response=await request.post('/api/task-runtime/settings',{data:{expectedRevision:settings.revision,activeConnectorId:'codex',connectorId,preset:{modelId:connectorId==='claude'?'sonnet':'',reasoningEffort:connectorId==='claude'?'medium':'default',timeoutMs:1800000,thinkingBudget:null,...(connectorId==='claude'?{authMode:'api-key'}:{})}}});
    expect(response.ok()).toBe(true);settings=(await response.json()).settings;
  }
});
for(const width of [390,1440])test(`Claude native session keeps API keys separate and offers only the explicit terminal sign-in at ${width}px`,async({page,request})=>{
  let credentialWrites=0;
  await page.route('**/api/task-runtime/providers/claude',async route=>{
    if(route.request().method()!=='GET'){credentialWrites++;return route.fulfill({status:400,json:{ok:false}});}
    const settings=(await(await request.get('/api/task-runtime/settings')).json()).settings;
    const native=settings.providerPresets.claude.authMode==='local-cli-session';
    return route.fulfill({json:{ok:true,credentials:{configured:false,status:'not-applicable',source:native?'native-cli':null,maskedValue:''},provider:{...health('claude'),models:[{id:'sonnet',efforts:['medium']}],...(native?{authMode:'local-cli-session',nativeSession:{status:'pending-auth',loginCommand:"'/fixture/node' '/fixture/Pritha/scripts/claude-auth.mjs' login"}}:{})}}});
  });
  await page.setViewportSize({width,height:960});await page.goto('/settings');await select(page,'claude');const surface=panel(page);
  await expect(surface.getByLabel('Claude Code API key',{exact:true})).toBeVisible();await surface.getByLabel('Claude authentication').selectOption('local-cli-session');
  await expect(surface.getByLabel('Claude Code API key',{exact:true})).toHaveCount(0);await expect(surface).toContainText('Save the local session preset');
  await surface.getByRole('button',{name:'Save preset',exact:true}).click();await expect(surface.getByRole('button',{name:'Copy sign-in command'})).toBeVisible();
  await expect(surface).toContainText('claude-auth.mjs');expect(credentialWrites).toBe(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await surface.getByLabel('Claude authentication').selectOption('api-key');await expect(surface.getByLabel('Claude Code API key',{exact:true})).toBeVisible();await expect(surface.getByRole('button',{name:'Copy sign-in command'})).toHaveCount(0);
});
for(const width of [1440,390])test(`five provider panels preserve independent drafts and keys stay out of storage at ${width}px`,async({page,request})=>{
  await page.setViewportSize({width,height:960});await page.goto('/settings');const surface=panel(page);
  await expect(surface.getByRole('tab')).toHaveCount(5);await expect(surface.getByRole('tabpanel')).toHaveCount(1);
  await select(page,'openrouter');await surface.getByLabel('OpenRouter model',{exact:true}).fill('vendor/alpha');await surface.getByLabel('OpenRouter timeout seconds').fill('45');
  await surface.getByLabel('OpenRouter API key',{exact:true}).fill('PRIVATE_BROWSER_KEY_CANARY');
  await select(page,'claude');await surface.getByLabel('Claude Code model',{exact:true}).fill('claude-fixture');await surface.getByRole('button',{name:'Save preset',exact:true}).click();await expect(surface).toContainText('Preset saved.');
  await select(page,'openrouter');await expect(surface.getByLabel('OpenRouter model',{exact:true})).toHaveValue('vendor/alpha');await expect(surface.getByLabel('OpenRouter timeout seconds')).toHaveValue('45');await expect(surface.getByLabel('OpenRouter API key',{exact:true})).toHaveValue('');
  await surface.getByRole('button',{name:'Save preset',exact:true}).click();await expect(surface).toContainText('Preset saved.');
  const saved=(await(await request.get('/api/task-runtime/settings')).json()).settings;
  expect(saved.providerPresets.openrouter.modelId).toBe('vendor/alpha');expect(saved.providerPresets.openrouter.timeoutMs).toBe(45000);expect(saved.providerPresets.claude.modelId).toBe('claude-fixture');
  await expect(surface.getByLabel('OpenRouter account')).toContainText('Remaining: Unknown');
  await surface.getByLabel('OpenRouter API key',{exact:true}).fill('PRIVATE_BROWSER_KEY_CANARY');
  const submitted=page.waitForRequest(request=>request.method()==='POST' && request.url().endsWith('/providers/openrouter'));
  await surface.getByRole('button',{name:'Save key',exact:true}).click();expect((await submitted).postDataJSON()).toEqual({value:'PRIVATE_BROWSER_KEY_CANARY',confirmation:'save-openrouter-key'});await expect(surface.getByLabel('OpenRouter API key',{exact:true})).toHaveValue('');
  expect(await page.evaluate(()=>JSON.stringify([Object.entries(localStorage),Object.entries(sessionStorage)]))).not.toContain('PRIVATE_BROWSER_KEY_CANARY');await expect(surface).not.toContainText('PRIVATE_BROWSER_KEY_CANARY');
  await select(page,'local');await expect(surface.getByRole('button',{name:'Use for new chats'})).toBeDisabled();await expect(surface.locator('input[type=password]')).toHaveCount(0);
  await select(page,'codex');await surface.getByRole('tab',{name:/^Codex/}).focus();await page.keyboard.press('End');await expect(surface.getByRole('tab',{name:/^Local/})).toBeFocused();await expect(surface.getByRole('tab',{name:/^Local/})).toHaveAttribute('aria-selected','true');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await select(page,'openrouter');await surface.screenshot({path:`test-results/provider-settings-${width}.png`});
});

test('a stale browser save cannot overwrite a newer preset, and an invalid number keeps its draft',async({page,request})=>{
  await page.goto('/settings');const surface=panel(page);await select(page,'openrouter');await surface.getByLabel('OpenRouter model',{exact:true}).fill('vendor/beta');
  const before=(await(await request.get('/api/task-runtime/settings')).json()).settings;
  expect((await request.post('/api/task-runtime/settings',{data:{expectedRevision:before.revision,connectorId:'openrouter',preset:{modelId:'vendor/alpha'}}})).ok()).toBe(true);
  await surface.getByRole('button',{name:'Save preset',exact:true}).click();await expect(surface).toContainText('Settings changed elsewhere.');await expect(surface.getByLabel('OpenRouter model',{exact:true})).toHaveValue('vendor/beta');
  expect((await(await request.get('/api/task-runtime/settings')).json()).settings.providerPresets.openrouter.modelId).toBe('vendor/alpha');
  await surface.getByRole('button',{name:'Reload saved presets'}).click();await expect(surface.getByLabel('OpenRouter model',{exact:true})).toHaveValue('vendor/alpha');
  const timeout=surface.getByLabel('OpenRouter timeout seconds');await timeout.fill('');await timeout.blur();await surface.getByRole('button',{name:'Save preset',exact:true}).click();await expect(surface).toContainText('Enter a timeout from 10 to 3600');await expect(timeout).toHaveValue('');
});

test('provider changes refresh Auto voice and retain an unsaved voice draft with a current save revision',async({page,request})=>{
  const original=(await(await request.get('/api/realtime/engine')).json()).voice;
  const saveVoice=async(voiceEngine:string,chained=original.chained)=>{
    const current=(await(await request.get('/api/realtime/engine')).json()).voice;
    expect((await request.post('/api/realtime/engine',{data:{voiceEngine,chained,expectedRevision:current.revision}})).ok()).toBe(true);
  };
  try{
    await saveVoice('auto');await page.goto('/settings');
    const voice=page.getByLabel('Voice engine',{exact:true}).filter({visible:true}),surface=panel(page);
    await expect(voice).toBeEnabled();await voice.selectOption('neuraldeep');
    const timbre=page.getByLabel('NeuralDeep voice',{exact:true}).filter({visible:true});await timbre.selectOption('vivian');
    await select(page,'openrouter');await surface.getByLabel('OpenRouter model',{exact:true}).fill('vendor/alpha');
    await surface.getByRole('button',{name:'Save preset',exact:true}).click();await expect(surface).toContainText('Preset saved.');
    await surface.getByRole('button',{name:'Use for new chats'}).click();await expect(surface).toContainText('OpenRouter selected for new chats.');
    await expect(page.getByText('Task provider updated. Your voice edits are retained.',{exact:true}).filter({visible:true})).toBeVisible();
    await expect(voice).toHaveValue('neuraldeep');await expect(timbre).toHaveValue('vivian');
    const save=page.getByRole('button',{name:'Save Voice Engine',exact:true}).filter({visible:true});
    await save.click();await expect(page.getByText('Voice engine saved. Reconnect to apply.',{exact:true}).filter({visible:true})).toBeVisible();
    expect((await(await request.get('/api/realtime/engine')).json()).voice.chained.voice).toBe('vivian');
    await voice.selectOption('auto');await save.click();await expect(save).toBeDisabled();
    // Reloading provider presets is explicit here because the voice save also
    // advances the shared document revision.
    await surface.getByRole('button',{name:'Reload saved presets'}).click();await select(page,'neuraldeep');
    await surface.getByRole('button',{name:'Use for new chats'}).click();await expect(surface).toContainText('NeuralDeep selected for new chats.');
    await expect(voice).toHaveValue('auto');await expect(timbre).toHaveValue('vivian');
    await expect(page.getByLabel('Voice model',{exact:true}).filter({visible:true})).toHaveCount(0);
  }finally{
    await saveVoice(original.preference);
    const current=(await(await request.get('/api/task-runtime/settings')).json()).settings;
    expect((await request.post('/api/task-runtime/settings',{data:{expectedRevision:current.revision,activeConnectorId:'codex'}})).ok()).toBe(true);
  }
});

test('voice settings conflicts preserve edits until an explicit reload',async({page,request})=>{
  const original=(await(await request.get('/api/realtime/engine')).json()).voice;
  const saveVoice=async(voiceEngine:string)=>{
    const current=(await(await request.get('/api/realtime/engine')).json()).voice;
    expect((await request.post('/api/realtime/engine',{data:{voiceEngine,expectedRevision:current.revision}})).ok()).toBe(true);
  };
  try{
    await saveVoice('auto');await page.goto('/settings');
    const voice=page.getByLabel('Voice engine',{exact:true}).filter({visible:true});await expect(voice).toBeEnabled();await voice.selectOption('openai');
    await saveVoice('neuraldeep');
    await page.getByRole('button',{name:'Save Voice Engine',exact:true}).filter({visible:true}).click();
    await expect(page.getByText(/Voice settings changed elsewhere\. Your edits are retained/).filter({visible:true})).toBeVisible();
    await expect(voice).toHaveValue('openai');
    await expect(page.getByRole('button',{name:'Save Voice Engine',exact:true}).filter({visible:true})).toBeDisabled();
    expect((await(await request.get('/api/realtime/engine')).json()).voice.preference).toBe('neuraldeep');
    await page.getByRole('button',{name:'Reload saved voice settings',exact:true}).filter({visible:true}).click();await expect(voice).toHaveValue('neuraldeep');
  }finally{await saveVoice(original.preference);}
});

for(const width of [1440,390])test(`image verification keeps the saved model and reports only confirmed readiness at ${width}px`,async({page,request})=>{
  const settings=(await(await request.get('/api/task-runtime/settings')).json()).settings,modelId=settings.providerPresets.neuraldeep.modelId;
  let verified=false,release:()=>void=()=>{};const gate=new Promise<void>(resolve=>release=resolve),sent:Array<any>=[];
  const imageHealth=()=>({...health('neuraldeep'),capabilities:{...health('neuraldeep').capabilities,attachments:{files:true,images:verified}}});
  await page.route('**/api/task-runtime/providers',route=>route.fulfill({json:{ok:true,providers:ids.map(id=>id==='neuraldeep'?imageHealth():health(id))}}));
  await page.route('**/api/task-runtime/providers/neuraldeep',route=>route.fulfill({json:{ok:true,credentials:{configured:true,status:'configured',source:'macos_keychain',maskedValue:'••••'},provider:{...imageHealth(),models:[{id:modelId,tools:true,visionAdvertised:true,inputModalities:['text','image']}]}}}));
  await page.route('**/api/task-runtime/providers/neuraldeep/attachments',async route=>{sent.push(route.request().postDataJSON());await gate;verified=true;await route.fulfill({json:{ok:true,verified:true,modelId,imageFormats:['image/png'],paidCalls:0}});});
  await page.setViewportSize({width,height:960});await page.goto('/settings');await select(page,'neuraldeep');const surface=panel(page),button=surface.getByRole('button',{name:'Verify image delivery',exact:true});
  await expect(button).toBeEnabled();await button.click();await expect(button).toBeDisabled();await expect(surface.getByRole('tab',{name:/^OpenRouter/})).toBeDisabled();
  await expect.poll(()=>sent.length).toBe(1);expect(sent[0]).toEqual({modelId,expectedRevision:settings.revision});release();
  await expect(surface).toContainText(`Original PNG delivery verified for ${modelId}.`);await expect(surface).toContainText('Original PNG delivery verified.');
  await page.reload();await select(page,'neuraldeep');await expect(panel(page)).toContainText('Original PNG delivery verified.');
  await panel(page).getByLabel('NeuralDeep timeout seconds').fill('45');await expect(panel(page).getByRole('button',{name:'Verify image delivery',exact:true})).toBeDisabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
