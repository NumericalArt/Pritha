import {test,expect,type Page} from '@playwright/test';

const ids=['codex','neuraldeep','claude','openrouter','local'];
const labels={codex:'Codex',neuraldeep:'NeuralDeep',claude:'Claude Code',openrouter:'OpenRouter',local:'Local'};
const health=(connectorId:string)=>({connectorId,status:connectorId==='local'?'configured':'ready',version:'fixture',checkedAt:new Date().toISOString(),error:connectorId==='local'?{code:'provider_offline_unverified',message:'Network isolation has not been verified.'}:null,capabilities:{steer:false,interrupt:true,approvals:true,tools:true,attachments:{files:false,images:false},usage:'observed',resume:true,sandbox:'host-enforced',offline:false}});
const panel=(page:Page)=>page.locator('[data-testid="provider-settings"]:visible');
const select=async(page:Page,id:keyof typeof labels)=>{await panel(page).getByRole('tab',{name:new RegExp('^'+labels[id])}).click();};
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
    const response=await request.post('/api/task-runtime/settings',{data:{expectedRevision:settings.revision,activeConnectorId:'codex',connectorId,preset:{modelId:connectorId==='claude'?'sonnet':'',reasoningEffort:connectorId==='claude'?'medium':'default',timeoutMs:1800000,thinkingBudget:null}}});
    expect(response.ok()).toBe(true);settings=(await response.json()).settings;
  }
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
