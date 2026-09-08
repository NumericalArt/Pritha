import { expect, test, type Page, type Route } from '@playwright/test';
async function fixture(page: Page) {
  const now=new Date().toISOString();
  const row=(id:string)=>({chatId:`chat_${id}`,title:`Chat ${id}`,preview:'',group:'my_chats',origin:'chat',status:'idle',activeFlags:[],taskLinks:[],archived:false,historyKind:'native',createdAt:now,updatedAt:now,runtime:{providerId:'desktop_bundled',compatibility:'bound'},continuationState:'continuation_enabled'});
  const rows=[row('A'),row('B')];
  const requests:Array<{route:Route;body:any;id:string}>=[];
  const controls:Array<{route:Route;body:any;id:string}>=[];
  const overrides:Record<string,any>={};
  const detail=(id:string)=>({thread:rows.find(r=>r.chatId===id)||row(id),continuationState:'continuation_enabled',pendingRequests:[],streamUrl:`/api/codex-chat/v1/threads/${id}/events`,history:{state:'available'},...overrides[id]});
  await page.route('**/api/codex-chat/v1/**',async route=>{
    const req=route.request(),url=new URL(req.url()),id=url.pathname.split('/')[5];
    if(req.method()==='POST'&&(url.pathname.endsWith('/threads')||url.pathname.endsWith('/turns'))){requests.push({route,body:req.postDataJSON(),id});return;}
    if(req.method()==='POST'&&['/control','/requests','/queue','/voice-control'].some(suffix=>url.pathname.endsWith(suffix))){controls.push({route,body:req.postDataJSON(),id});return;}
    if(url.pathname.endsWith('/events'))return route.fulfill({contentType:'text/event-stream',body:': ready\n\n'});
    const data=url.pathname.endsWith('/runtime')?{availability:'ready',preferredProvider:'auto',effectiveProvider:'desktop_bundled',providers:[{providerId:'desktop_bundled',availability:'ready',capabilities:{fullChat:true}}],models:[],selected:{modelId:'test'}}
      :url.pathname.endsWith('/activity')?{cursor:0,changed:[]}
      :url.pathname.endsWith('/threads')?{data:rows,nextCursor:null}
      :url.pathname.endsWith('/delivery')?{runs:[]}
      :url.pathname.endsWith('/history')?{data:[],hasOlder:false,olderCursor:null}
      :detail(id);
    return route.fulfill({json:{apiVersion:'1',requestId:'test',data}});
  });
  async function finish(index:number,chatId:string) {
    const pending=requests[index],body=pending.body.initialTurn||pending.body;
    const turn={turnId:`turn_${index}`,clientMessageId:body.clientMessageId,status:'completed',userMessage:{id:`user_${index}`,role:'user',markdown:body.input[0].text,status:'completed',createdAt:now},items:[],pendingRequestIds:[],startedAt:now,error:null};
    if(!rows.some(r=>r.chatId===chatId))rows.push({...row(chatId.slice(5)),chatId});
    const accepted={turn,streamUrl:`/api/codex-chat/v1/threads/${chatId}/events`};
    await pending.route.fulfill({status:202,json:{apiVersion:'1',requestId:'sent',data:pending.body.initialTurn?{detail:detail(chatId),accepted}:accepted}});
  }
  return {requests,finish,controls,overrides,rows};
}
test('a delayed send in A allows sending B and preserves newer edits',async({page})=>{
  const f=await fixture(page);await page.goto('/task-chat?group=my_chats&chat=chat_A');
  const composer=page.locator('.codex-composer textarea');
  await expect(composer).toBeEnabled();await composer.fill('Message A');await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect.poll(()=>f.requests.length).toBe(1);
  await page.getByRole('button',{name:/Chat B/}).click();await expect(composer).toBeEnabled();
  await composer.fill('Message B');await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect.poll(()=>f.requests.length).toBe(2);await composer.fill('Newer B draft');
  await f.finish(0,'chat_A');await expect(page).toHaveURL(/chat=chat_B/);await expect(composer).toHaveValue('Newer B draft');
  await f.finish(1,'chat_B');await expect(composer).toHaveValue('Newer B draft');
});
test('two new chats send independently and late creation never changes the selected conversation',async({page})=>{
  const f=await fixture(page);await page.goto('/task-chat?group=my_chats&chat=chat_A');
  const composer=page.locator('.codex-composer textarea');
  await page.getByLabel('Task Chat history').getByRole('button',{name:'New chat',exact:true}).click();await composer.fill('New draft one');await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect.poll(()=>f.requests.length).toBe(1);
  await page.getByLabel('Task Chat history').getByRole('button',{name:'New chat',exact:true}).click();await composer.fill('New draft two');await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect.poll(()=>f.requests.length).toBe(2);
  expect(f.requests[0].body.clientThreadId).not.toBe(f.requests[1].body.clientThreadId);
  await page.getByRole('button',{name:/Chat B/}).click();await expect(composer).toBeEnabled();await composer.fill('Keep B');
  await f.finish(1,'chat_newtwo');await f.finish(0,'chat_newone');
  await expect(page).toHaveURL(/chat=chat_B/);await expect(composer).toHaveValue('Keep B');
});

test('reload preserves an unconfirmed first request and newer draft edits',async({page})=>{
  const f=await fixture(page);await page.goto('/task-chat?group=my_chats&chat=chat_A');
  const composer=page.locator('.codex-composer textarea');
  await page.getByLabel('Task Chat history').getByRole('button',{name:'New chat',exact:true}).click();
  await composer.fill('Original first message');await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect.poll(()=>f.requests.length).toBe(1);
  const original=f.requests[0].body;
  await composer.fill('Later unsent edit');await page.reload();
  await expect(composer).toHaveValue('Later unsent edit');
  await page.getByRole('button',{name:'Check and retry same message',exact:true}).click();
  await expect.poll(()=>f.requests.length).toBe(2);
  expect(f.requests[1].body).toEqual(original);
  await f.finish(1,'chat_recovered');await expect(composer).toHaveValue('Later unsent edit');
});

test('an active-turn clarification has an exact target and does not lock a neighboring chat',async({page})=>{
  const f=await fixture(page);f.overrides.chat_A={activeTurnId:'turn_A',controls:{turnId:'turn_A',steer:true,interrupt:true}};
  await page.goto('/task-chat?group=my_chats&chat=chat_A');
  const composer=page.locator('.codex-composer textarea');await expect(composer).toBeEnabled();
  await composer.fill('Clarification for A');await page.getByRole('button',{name:'Clarify this turn'}).click();
  await expect.poll(()=>f.controls.length).toBe(1);
  expect(f.controls[0].body).toMatchObject({action:'steer',text:'Clarification for A',expectedTurnId:'turn_A'});
  expect(f.controls[0].body).not.toHaveProperty('settings');
  await page.getByRole('button',{name:/Chat B/}).click();await composer.fill('Independent B');
  await page.getByRole('button',{name:'Send',exact:true}).click();await expect.poll(()=>f.requests.length).toBe(1);
  await f.controls[0].route.fulfill({json:{apiVersion:'1',data:{status:'requested'}}});
  await expect(page).toHaveURL(/chat=chat_B/);await expect(composer).toHaveValue('Independent B');
  await f.finish(0,'chat_B');
});

test('mobile native input stays within the page and answers only its exact request',async({page})=>{
  await page.setViewportSize({width:390,height:844});const f=await fixture(page);
  f.overrides.chat_A={activeTurnId:'turn_A',controls:{turnId:'turn_A',steer:false,interrupt:true},pendingRequests:[{requestId:'request_A',kind:'user_input',title:'Input needed',presentation:{state:'pending',revision:7,questions:[{id:'q_A',question:'Choose the test target',isSecret:false}]}}]};
  await page.goto('/task-chat?group=my_chats&chat=chat_A');
  await page.getByLabel('Choose the test target').fill('Fixture only');
  await page.getByRole('button',{name:'Submit answer',exact:true}).click();
  await expect.poll(()=>f.controls.length).toBe(1);
  expect(f.controls[0].body).toMatchObject({requestId:'request_A',revision:7,answers:{q_A:['Fixture only']}});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await f.controls[0].route.fulfill({json:{apiVersion:'1',data:{submitted:true}}});
});
