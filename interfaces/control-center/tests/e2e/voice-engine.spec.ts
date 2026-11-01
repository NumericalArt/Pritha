import {test,expect} from '@playwright/test';

test('Voice engine persists independently and stale writes preserve the current choice',async({page})=>{
  expect(process.env.PRITHA_E2E_ISOLATED_STATE).toBe('1');
  const before=(await (await page.request.get('/api/task-runtime/settings')).json()).settings;
  const originalVoice=(await (await page.request.get('/api/realtime/engine')).json()).voice;
  try{
    await page.goto('/settings');
    const selector=page.getByLabel('Voice engine',{exact:true}).filter({visible:true});
    await expect(selector).toBeEnabled();
    const next=before.voiceEngine==='neuraldeep'?'openai':'neuraldeep';
    await selector.selectOption(next);
    if(next==='neuraldeep'){
      await page.getByLabel('NeuralDeep voice',{exact:true}).filter({visible:true}).selectOption('vivian');
      await page.getByLabel('NeuralDeep speech language',{exact:true}).filter({visible:true}).selectOption('ru');
      await expect(page.getByLabel('Voice model',{exact:true}).filter({visible:true})).toHaveCount(0);
    }
    await page.getByRole('button',{name:'Save Voice Engine',exact:true}).filter({visible:true}).click();
    await expect(page.getByText('Voice engine saved. Reconnect to apply.',{exact:true}).filter({visible:true})).toBeVisible();
    await page.reload();await expect(selector).toHaveValue(next);
    const saved=(await (await page.request.get('/api/task-runtime/settings')).json()).settings;
    expect(saved.providerPresets).toEqual(before.providerPresets);expect(saved.activeConnectorId).toBe(before.activeConnectorId);
    const stale=await page.request.post('/api/realtime/engine',{data:{voiceEngine:'auto',expectedRevision:before.revision}});
    expect(stale.status()).toBe(409);
    const unknown=await page.request.post('/api/realtime/engine',{data:{voiceEngine:'unknown',expectedRevision:saved.revision}});
    expect(unknown.status()).toBe(400);
    const unchanged=(await (await page.request.get('/api/realtime/engine')).json()).voice;
    expect(unchanged.preference).toBe(next);expect(unchanged.revision).toBe(saved.revision);
    if(next==='neuraldeep'){expect(unchanged.chained.voice).toBe('vivian');expect(unchanged.chained.language).toBe('ru');}
    const malformed=await page.request.post('/api/realtime/engine',{data:{voiceEngine:next,expectedRevision:saved.revision,chained:{language:['ru']}}});expect(malformed.status()).toBe(400);
  }finally{
    const current=(await (await page.request.get('/api/task-runtime/settings')).json()).settings;
    expect((await page.request.post('/api/realtime/engine',{data:{voiceEngine:before.voiceEngine,expectedRevision:current.revision,chained:originalVoice.chained}})).ok()).toBe(true);
  }
});

for(const reason of ['offline','pending-auth'])test(`Voice ${reason} fails before microphone access or cloud session creation`,async({page})=>{
  await page.addInitScript(()=>{(window as any).__micCalls=0;Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{(window as any).__micCalls++;throw new Error('must not request microphone');}});});
  let starts=0;
  await page.route('**/api/realtime/status',route=>route.fulfill({json:{ok:true,model:'gpt-realtime-2',voice:'marin',tools:[],openai_key_configured:true,voice_engine:{engine:null,reason},memory:{stats:[]},codex:{available:true},transcription_model:'fixture'}}));
  await page.route('**/api/realtime/session',route=>{starts++;return route.fulfill({status:500,json:{error:'must not request cloud session'}});});
  await page.goto('/voice');
  await expect(page.getByRole('button',{name:reason==='offline'?'Cloud Voice Off':'Missing API Key',exact:true}).filter({visible:true}).first()).toBeDisabled();
  await expect(page.getByText(reason==='offline'?'Cloud voice is off':'Voice provider key missing',{exact:true}).filter({visible:true}).first()).toBeVisible();
  expect(starts).toBe(0);expect(await page.evaluate(()=>(window as any).__micCalls)).toBe(0);
});

test('NeuralDeep voice starts without an OpenAI key, loads local VAD and consumes each host tool receipt once',async({page})=>{
  await page.addInitScript(()=>{
    class Events {
      readyState=1;onopen:any;onmessage:any;onerror:any;static CLOSED=2;
      constructor(url:string){if(url.includes('/api/voice/'))(window as any).__ndEvents=this;setTimeout(()=>this.onopen?.(),20);}
      close(){this.readyState=2;}
    }
    Object.defineProperty(window,'EventSource',{value:Events});
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{const context=new AudioContext();(window as any).__testMicContext=context;return context.createMediaStreamDestination().stream;}});
  });
  let openaiCalls=0,toolDispatches=0,closed=0;
  await page.route('**/api/realtime/status',route=>route.fulfill({json:{ok:true,model:'qwen3.6-35b-a3b-noreason',voice:'serena',tools:[],openai_key_configured:false,voice_engine:{engine:'neuraldeep',reason:'configured'},memory:{stats:[]},codex:{available:true},transcription_model:'whisper-1'}}));
  await page.route('**/api/realtime/session',route=>{openaiCalls++;return route.fulfill({status:500,json:{error:'wrong engine'}});});
  await page.route('**/api/realtime/tool',route=>{toolDispatches++;return route.fulfill({json:{ok:false,error:'receipt must not redispatch'}});});
  await page.route('**/api/voice/sessions',route=>route.fulfill({json:{ok:true,sessionId:'voice-fixture',settings:{model:'qwen3.6-35b-a3b-noreason',voice:'serena'},tools:['inspect_pritha_files']}}));
  await page.route('**/api/voice/sessions/voice-fixture',route=>{if(route.request().method()==='DELETE')closed++;return route.fulfill({json:{ok:true}});});
  await page.goto('/voice');await page.getByRole('button',{name:'Start Listening',exact:true}).filter({visible:true}).click();
  await expect(page.getByRole('button',{name:'Stop Listening',exact:true}).filter({visible:true})).toBeVisible({timeout:30000});
  await page.evaluate(()=>{
    const emit=(event:any)=>(window as any).__ndEvents.onmessage({data:JSON.stringify(event)});
    emit({id:1,type:'transcript.user',turnId:'fixture-turn',text:'Проверь файлы'});
    emit({id:2,type:'tool.result',turnId:'fixture-turn',operationId:'fixture-operation',name:'inspect_pritha_files',arguments:{operation:'status'},output:{ok:true,summary:'Fixture receipt'}});
    emit({id:3,type:'tool.result',turnId:'fixture-turn',operationId:'fixture-operation',name:'inspect_pritha_files',arguments:{operation:'status'},output:{ok:true,summary:'Fixture receipt'}});
    emit({id:4,type:'transcript.assistant',turnId:'fixture-turn',text:'Файлы проверены'});
    emit({id:5,type:'turn.completed',turnId:'fixture-turn'});
  });
  await expect.poll(()=>page.evaluate(()=>JSON.stringify(sessionStorage).includes('Файлы проверены'))).toBe(true);
  expect(openaiCalls).toBe(0);expect(toolDispatches).toBe(0);
  await page.getByRole('button',{name:'Stop Listening',exact:true}).filter({visible:true}).click();
  await expect.poll(()=>closed).toBeGreaterThan(0);
});
