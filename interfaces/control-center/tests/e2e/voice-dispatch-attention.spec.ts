import {test,expect} from '@playwright/test';

for(const width of [1440,390])for(const factoryFailed of [false,true])test(`a blocked Voice task shows its cause and zero progress (${factoryFailed?'factory failure':'before dispatch'}) at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:1000});
  const reason=factoryFailed?'Создание черновика агента не подтверждено. Это не успешное создание агента.':'Задача ещё не запущена: в исходном проекте есть незакоммиченные изменения. Для нового агента отмените эту карточку и попросите создать отдельного нового агента.';
  const snapshot={ok:true,task_id:'voice-blocked-fixture',short_id:'ABC',task:'Synthetic blocked Voice task',status:factoryFailed?'failed':'waiting_for_operator',phase:factoryFailed?'factory_draft_failed':'provider_dispatch_attention',complete:factoryFailed,
    connector_id:'claude',dispatch_state:factoryFailed?'completed':'reserved',error_code:factoryFailed?'factory_not_started':'workspace_dirty',factory_draft_failed:factoryFailed,progress_percent:0,progress_detail:{source:'before_dispatch',total_steps:0,completed_steps:0},
    operator_brief:reason,latest_voice_feedback:{voice_text:reason,phase:'provider_attention',priority:'high',requires_response:false},
    task_chat_href:null,chat_id:null,turn_id:null,created_at:new Date().toISOString(),request:{task:'Synthetic blocked Voice task'}};
  let aborted=0;
  await page.route('**/api/realtime/codex-task**',route=>{
    if(route.request().url().endsWith('/abort')){aborted++;return route.fulfill({json:{...snapshot,status:'aborted',complete:true,abort_applied:true}});}
    return route.fulfill({json:route.request().url().includes('limit=')?{ok:true,tasks:[snapshot]}:snapshot});
  });
  await page.goto('/voice');
  const card=page.locator('.task-list-row:visible').filter({hasText:'Synthetic blocked Voice task'}).first();
  await expect(card).toBeVisible();await expect(card.getByText('0%',{exact:true})).toBeVisible();
  if(factoryFailed){await expect(card).toContainText('черновика агента не подтверждено');await expect(card.getByText('failed',{exact:true})).toBeVisible();}
  else{await expect(card).toContainText('незакоммиченные изменения');await expect(card).toContainText('отдельного нового агента');}
  await expect(card.getByRole('button',{name:'Approve',exact:true})).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
  if(factoryFailed)await expect(card.getByRole('button',{name:'Abort',exact:true})).toBeDisabled();
  else{await card.getByRole('button',{name:'Abort',exact:true}).click();await expect.poll(()=>aborted).toBe(1);}
});
