import {test,expect} from '@playwright/test';

test('an unfinished Local setup cannot replace the common Task Chat and Voice default',async({page})=>{
  expect(process.env.PRITHA_E2E_ISOLATED_STATE).toBe('1');
  const get=async()=>(await(await page.request.get('/api/task-runtime/settings')).json()).settings;
  const before=await get();
  const save=async(patch:Record<string,unknown>)=>page.request.post('/api/task-runtime/settings',{data:{expectedRevision:(await get()).revision,...patch}});
  try{
    expect((await save({connectorId:'local',preset:{modelId:'voice-e2e-local',baseUrl:'http://127.0.0.1:9/v1'}})).ok()).toBe(true);
    const configured=await get(),blocked=await save({activeConnectorId:'local'});
    expect(blocked.status()).toBe(400);expect((await blocked.json()).error).toBe('provider_default_not_ready');
    expect(await get()).toEqual(configured);expect(configured.activeConnectorId).toBe(before.activeConnectorId);
    await page.goto('/settings');const panel=page.locator('[data-testid="provider-settings"]:visible');
    await panel.getByRole('tab',{name:/^Local/}).click();
    await expect(panel.getByRole('button',{name:'Set default for tasks + Voice',exact:true})).toBeDisabled();
    await expect(panel).toContainText('Local is selected for setup; the saved default stays unchanged until you set it.');
  }finally{
    expect((await save({connectorId:'local',preset:{...before.providerPresets.local,baseUrl:before.providerPresets.local.baseUrl || null}})).ok()).toBe(true);
  }
});
