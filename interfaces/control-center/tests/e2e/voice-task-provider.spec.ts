import {test,expect} from '@playwright/test';

test('public Voice task stays with Local and shows its explicit blocker after changing the default',async({page})=>{
  expect(process.env.PRITHA_E2E_ISOLATED_STATE).toBe('1');
  const before=(await(await page.request.get('/api/task-runtime/settings')).json()).settings;
  const save=async(patch:Record<string,unknown>)=>{
    const current=(await(await page.request.get('/api/task-runtime/settings')).json()).settings;
    const response=await page.request.post('/api/task-runtime/settings',{data:{expectedRevision:current.revision,...patch}});
    expect(response.ok()).toBe(true);
  };
  try{
    // The configured loopback endpoint is deliberately unreachable. Its actual
    // availability error must survive readback without a native fallback.
    await save({connectorId:'local',preset:{modelId:'voice-e2e-local',baseUrl:'http://127.0.0.1:9/v1'}});
    await save({activeConnectorId:'local'});
    const text='Inspect the local fixture for provider voice routing.';
    const response=await page.request.post('/api/realtime/tool',{data:{name:'run_codex_task',arguments:{task:text,task_type:'analysis',write_mode:'read_only',continuation_mode:'force_new'}}});
    expect(response.ok()).toBe(true);
    const task=await response.json();
    expect(task.ok).toBe(true);expect(task.connector_id).toBe('local');expect(task.effective_transport).toBe('task-chat');expect(task.fallback_transport).toBeNull();
    expect(task.status).toBe('waiting_for_operator');
    const detail=(await(await page.request.get(`/api/realtime/codex-task/${encodeURIComponent(task.task_id)}`)).json());
    expect(detail.connector_id).toBe('local');expect(detail.complete).toBe(false);expect(detail.status_detail.error_code).toBe('provider_unavailable');
    const creation=await(await page.request.post('/api/realtime/tool',{data:{name:'run_codex_task',arguments:{task:'Create a local line-counting agent from the complete product brief.',task_type:'agent_creation',write_mode:'workspace_write',subject_kind:'agent',subject_id:'voice-factory-e2e',continuation_mode:'force_new',operator_confirmation:'Да, ТЗ полностью проговорено, запускай.'}}})).json();
    expect(creation.ok).toBe(true);expect(creation.connector_id).toBe('local');expect(creation.effective_transport).toBe('task-chat');expect(creation.fallback_transport).toBeNull();
    const factoryDetail=(await(await page.request.get(`/api/realtime/codex-task/${encodeURIComponent(creation.task_id)}`)).json());
    expect(factoryDetail.complete).toBe(false);expect(factoryDetail.status_detail.error_code).toBe('provider_unavailable');
    await save({activeConnectorId:'codex'});
    const inspected=await(await page.request.post('/api/realtime/tool',{data:{name:'inspect_codex_task',arguments:{task_id:task.task_id}}})).json();
    expect(inspected.ok).toBe(true);
    const unchanged=await(await page.request.get(`/api/realtime/codex-task/${encodeURIComponent(task.task_id)}`)).json();
    expect(unchanged.connector_id).toBe('local');expect(unchanged.status_detail.error_code).toBe(detail.status_detail.error_code);
    await page.goto('/voice');
    const row=page.locator('.task-list-row:visible').filter({hasText:text}).first();
    await expect(row).toBeVisible();await row.getByRole('button',{name:'Details',exact:true}).click();
    await expect(page.getByText('Task provider',{exact:true})).toBeVisible();
    await expect(page.locator('.drawer-kv').getByText('local',{exact:true})).toBeVisible();
  }finally{
    await save({connectorId:'local',preset:{...before.providerPresets.local,baseUrl:before.providerPresets.local.baseUrl || null}});
    await save({activeConnectorId:before.activeConnectorId});
  }
});
