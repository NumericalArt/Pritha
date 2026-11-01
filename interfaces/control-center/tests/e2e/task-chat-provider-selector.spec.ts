import {test,expect,type Page,type Route} from '@playwright/test';

async function fixture(page:Page){
  const now=new Date().toISOString(),requests:Array<{route:Route;body:any;chatId?:string}>=[],previews:Array<{route:Route;url:URL}>=[];let holdPreview=false,defaultProvider='codex',settingsWrites=0;
  const presets={codex:{modelId:'native-model',reasoningEffort:'medium',timeoutMs:30000},openrouter:{modelId:'vendor/alpha',reasoningEffort:'default',timeoutMs:30000},claude:{modelId:'claude-fixture',reasoningEffort:'high',timeoutMs:30000},neuraldeep:{modelId:'nd-fixture',reasoningEffort:'xhigh',timeoutMs:30000},local:{modelId:'local-fixture',reasoningEffort:'default',timeoutMs:30000}};
  const row=(chatId:string,connectorId='codex',modelId='native-model',effortId='medium')=>({chatId,title:chatId==='chat_native_saved'?'Native saved':`${connectorId} saved`,preview:'',group:'my_chats',origin:'chat',status:'idle',activeFlags:[],taskLinks:[],archived:false,historyKind:connectorId==='codex'?'native':'mirrored',createdAt:now,updatedAt:now,runtime:{connectorId,modelId,providerId:connectorId==='codex'?'desktop_bundled':connectorId+'_runtime',compatibility:'bound'},continuationState:'continuation_enabled',effortId});
  const rows=[row('chat_native_saved')];
  const detail=(chatId:string)=>({thread:rows.find(row=>row.chatId===chatId) || row(chatId),continuationState:'continuation_enabled',pendingRequests:[],queued:[],activeTurnId:null,history:{state:'available'},streamUrl:`/api/codex-chat/v1/threads/${chatId}/events`});
  const runtime=(url:URL)=>{
    const saved=rows.find(row=>row.chatId===url.searchParams.get('chatId')),connectorId=(saved?.runtime.connectorId || url.searchParams.get('connectorId') || defaultProvider) as keyof typeof presets,preset=presets[connectorId];
    const modelId=saved?.runtime.modelId || url.searchParams.get('modelId') || preset.modelId,effortId=saved?.effortId || url.searchParams.get('effortId') || preset.reasoningEffort,providerId=connectorId==='codex'?'desktop_bundled':connectorId+'_runtime';
    const models=(connectorId==='openrouter'?['vendor/alpha','vendor/beta']:[preset.modelId]).map(id=>({id,label:id,effortIds:connectorId==='openrouter'?['default','high']:['medium','high'],defaultEffortId:preset.reasoningEffort,serviceTierIds:connectorId==='codex'?['standard','fast']:[],inputModalities:['text']}));
    return {connectorId,availability:'ready',preferredProvider:providerId,effectiveProvider:providerId,effectiveProtocol:connectorId==='codex'?'app_server':'exec_resume',fallbackEnabled:false,probedAt:now,models,selected:{modelId,effortId,serviceTierId:connectorId==='codex'?url.searchParams.get('serviceTierId') || 'standard':null,sandboxMode:'read_only',approvalMode:'on_request'},providers:[{providerId,label:connectorId,locationLabel:connectorId,protocol:'app_server',availability:'ready',capabilities:{fullChat:true,fileMetadata:connectorId==='codex',imageInput:false,steerTurn:false,interruptTurn:true}}]};
  };
  const envelope=(data:any)=>({apiVersion:'1',requestId:'fixture',data});
  await page.route('**/api/task-runtime/settings',route=>{if(route.request().method()==='POST')settingsWrites++;return route.fulfill({json:{ok:true,settings:{version:1,revision:0,activeConnectorId:defaultProvider,providerPresets:presets}}});});
  await page.route('**/api/task-runtime/providers',route=>route.fulfill({json:{ok:true,providers:Object.keys(presets).map(connectorId=>({connectorId,status:['codex','claude','openrouter'].includes(connectorId)?'ready':'configured'}))}}));
  await page.route('**/api/codex-chat/v1/**',async route=>{
    const request=route.request(),url=new URL(request.url()),parts=url.pathname.split('/'),chatId=parts[5];
    if(request.method()==='POST' && (url.pathname.endsWith('/threads') || url.pathname.endsWith('/turns'))){requests.push({route,body:request.postDataJSON(),chatId});return;}
    if(url.pathname.endsWith('/runtime')){if(holdPreview && url.searchParams.has('connectorId') && !previews.some(entry=>entry.url.searchParams.get('connectorId')===url.searchParams.get('connectorId'))){previews.push({route,url});return;}return route.fulfill({json:envelope(runtime(url))});}
    if(url.pathname.endsWith('/events'))return route.fulfill({contentType:'text/event-stream',body:': ready\n\n'});
    const data=url.pathname.endsWith('/threads')?{data:rows,nextCursor:null}:url.pathname.endsWith('/activity')?{cursor:0,changed:[],admissionEnabled:true}:url.pathname.endsWith('/history')?{data:[],hasOlder:false,olderCursor:null}:url.pathname.endsWith('/workspace')?{git:false,dirty:false,baseRevision:null}:url.pathname.endsWith('/goal')?{availability:'unsupported'}:url.pathname.endsWith('/delivery')?{runs:[]}:detail(chatId);
    return route.fulfill({json:envelope(data)});
  });
  async function finish(index:number,chatId:string){const pending=requests[index],input=pending.body.initialTurn || pending.body,settings=input.settings || {},connectorId=pending.body.connectorId || 'codex';
    if(!rows.some(row=>row.chatId===chatId))rows.push(row(chatId,connectorId,settings.modelId,settings.effortId));
    const turn={turnId:'turn_'+index,clientMessageId:input.clientMessageId,status:'completed',userMessage:{id:'message_'+index,role:'user',markdown:input.input[0].text,status:'completed',createdAt:now},items:[],pendingRequestIds:[],startedAt:now,error:null},accepted={turn,streamUrl:`/api/codex-chat/v1/threads/${chatId}/events`};
    await pending.route.fulfill({status:202,json:envelope(pending.body.initialTurn?{detail:detail(chatId),accepted}:accepted)});
  }
  return {requests,previews,finish,hold(){holdPreview=true;},async release(index:number){const entry=previews[index];await entry.route.fulfill({json:envelope(runtime(entry.url))});},changeDefault(id:string){defaultProvider=id;},writes:()=>settingsWrites};
}
async function newDraft(page:Page,width=1440){
  await expect(page.locator('.codex-composer textarea')).toBeEnabled();
  if(width<700)await page.getByRole('button',{name:'Open chat history',exact:true}).click();
  await page.locator('button.codex-new-chat:visible',{hasText:'New chat'}).first().click();
  await expect(page.getByLabel('New chat provider',{exact:true})).toBeEnabled();
}
for(const width of [1440,390])test(`new-chat provider/model/effort is explicit and ready-only at ${width}px`,async({page})=>{
  const f=await fixture(page);await page.setViewportSize({width,height:960});await page.goto('/task-chat?group=my_chats&chat=chat_native_saved');await newDraft(page,width);
  const provider=page.getByLabel('New chat provider',{exact:true});expect(await provider.locator('option').evaluateAll(options=>options.map(option=>(option as HTMLOptionElement).value))).toEqual(['codex','claude','openrouter']);
  await provider.selectOption('openrouter');await page.getByLabel('New chat model',{exact:true}).selectOption('vendor/beta');await page.getByLabel('New chat reasoning').selectOption('high');
  await page.locator('.codex-composer textarea').fill('Explicit selected provider');await page.getByRole('button',{name:'Send',exact:true}).click();await expect.poll(()=>f.requests.length).toBe(1);
  expect(f.requests[0].body).toMatchObject({connectorId:'openrouter',initialTurn:{settings:{modelId:'vendor/beta',effortId:'high'}}});expect(f.requests[0].body.initialTurn.settings.serviceTierId).toBeUndefined();expect(f.writes()).toBe(0);
  await f.finish(0,'chat_openrouter_saved');await expect(page).toHaveURL(/chat_openrouter_saved/);await expect(page.getByLabel('New chat provider',{exact:true})).toHaveCount(0);await expect(page.locator('.codex-conversation-heading')).toContainText('OpenRouter');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('uncertain first delivery keeps the exact provider across reload and a changed default',async({page})=>{
  const f=await fixture(page);await page.goto('/task-chat?group=my_chats&chat=chat_native_saved');await newDraft(page);
  await page.getByLabel('New chat provider',{exact:true}).selectOption('openrouter');await page.getByLabel('New chat model',{exact:true}).selectOption('vendor/beta');await page.getByLabel('New chat reasoning').selectOption('high');
  const composer=page.locator('.codex-composer textarea');await composer.fill('Original exact request');await page.getByRole('button',{name:'Send',exact:true}).click();await expect.poll(()=>f.requests.length).toBe(1);
  const original=f.requests[0].body;await composer.fill('Keep this newer draft');f.changeDefault('claude');await page.reload();
  await expect(composer).toHaveValue('Keep this newer draft');await expect(page.getByLabel('New chat provider',{exact:true})).toHaveValue('openrouter');await expect(page.getByLabel('New chat provider',{exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Check and retry same message',exact:true}).click();await expect.poll(()=>f.requests.length).toBe(2);expect(f.requests[1].body).toEqual(original);expect(f.writes()).toBe(0);
  await f.finish(1,'chat_openrouter_recovered');await expect(composer).toHaveValue('Keep this newer draft');
});
test('a late preview cannot switch the chosen provider or retarget an existing native chat',async({page})=>{
  const f=await fixture(page);await page.goto('/task-chat?group=my_chats&chat=chat_native_saved');await newDraft(page);f.hold();
  const provider=page.getByLabel('New chat provider',{exact:true});await provider.selectOption('openrouter');await expect.poll(()=>f.previews.length).toBe(1);await provider.selectOption('claude');await expect.poll(()=>f.previews.length).toBe(2);
  await f.release(1);await expect(page.getByLabel('New chat model',{exact:true})).toHaveValue('claude-fixture');await f.release(0);await expect(provider).toHaveValue('claude');
  const composer=page.locator('.codex-composer textarea');await composer.fill('Claude selected');await page.getByRole('button',{name:'Send',exact:true}).click();await expect.poll(()=>f.requests.length).toBe(1);expect(f.requests[0].body.connectorId).toBe('claude');
  await page.getByLabel('Task Chat history',{exact:true}).getByRole('button',{name:/Native saved/}).click();await expect(page.getByLabel('New chat provider',{exact:true})).toHaveCount(0);
  await composer.fill('Native follow-up');await page.getByRole('button',{name:'Send',exact:true}).click();await expect.poll(()=>f.requests.length).toBe(2);expect(f.requests[1].chatId).toBe('chat_native_saved');expect(f.requests[1].body.settings.modelId).toBe('native-model');
  await f.finish(1,'chat_native_saved');await f.finish(0,'chat_claude_created');await expect(page).toHaveURL(/chat_native_saved/);
});
