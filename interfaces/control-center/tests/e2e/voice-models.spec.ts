import { expect, test } from '@playwright/test';

test('incomplete Voice settings use Realtime 2 while an explicit Live choice remains intact', async ({page}) => {
  let model:string|undefined, writes=0;
  await page.route('**/api/realtime/runtime-settings',async route=>{
    if(route.request().method()==='POST'){writes++;model=route.request().postDataJSON().voiceModel;}
    return route.fulfill({json:{ok:true,settings:model?{voiceModel:model}:{}}});
  });
  await page.goto('/settings');
  const selector=page.getByLabel('Voice model',{exact:true}).filter({visible:true});
  await expect(selector).toHaveValue('gpt-realtime-2');expect(writes).toBe(0);
  await selector.selectOption('gpt-live-1');
  await page.getByRole('button',{name:'Save Voice Runtime',exact:true}).filter({visible:true}).click();
  await expect(page.getByText('Runtime settings saved',{exact:true}).filter({visible:true})).toBeVisible();
  await page.reload();await expect(selector).toHaveValue('gpt-live-1');expect(writes).toBe(1);
});

for (const width of [1280,390]) {
  test(`Voice model selection persists and rejects unsupported models at ${width}px`, async ({ page }) => {
    expect(process.env.PRITHA_E2E_ISOLATED_STATE).toBe('1');
    await page.setViewportSize({width,height:900});
    await page.goto('/settings');
    if(width===390) await page.getByRole('tab',{name:'Voice',exact:true}).click();
    const selector=page.getByLabel('Voice model',{exact:true}).filter({visible:true});
    await expect(selector).toBeVisible();
    for(const model of ['gpt-realtime-2','gpt-live-1']) {
      await selector.selectOption(model);
      await page.getByRole('button',{name:'Save Voice Runtime',exact:true}).filter({visible:true}).click();
      await expect(page.getByText('Runtime settings saved',{exact:true}).filter({visible:true})).toBeVisible();
      await page.reload(); if(width===390) await page.getByRole('tab',{name:'Voice',exact:true}).click(); await expect(selector).toHaveValue(model);
      const status=await (await page.request.get('/api/realtime/status')).json();
      expect(status.model).toBe(model);
    }
    const denied=await page.request.post('/api/realtime/runtime-settings',{data:{voiceModel:'unknown'}});
    expect(denied.status()).toBe(400);
    const settings=await (await page.request.get('/api/realtime/runtime-settings')).json();
    expect(settings.settings.voiceModel).toBe('gpt-live-1');
    await selector.locator("xpath=ancestor::section[1]").screenshot({path:`test-results/voice-models-${width}.png`});
    // Live config uses the selected voice and the same authorized application tools.
    const config=await (await page.request.post('/api/realtime/session-config',{data:{musicControlEnabled:false}})).json();
    expect(config.live_responses.model).toBe('gpt-5.6-terra');
    expect(config.live_responses.tools.some((tool:any)=>tool.name==='run_codex_task')).toBe(true);
    expect(config.live_responses.tools.some((tool:any)=>tool.name==='music_control')).toBe(false);
    expect(config.tools.some((tool:any)=>tool.name==='run_codex_task')).toBe(true);
  });
}

for (const api of ['live','realtime']) {
  test(`Voice ${api} negotiates the correct protocol and handles speech and disconnect`,async({page})=>{
    expect(process.env.PRITHA_E2E_ISOLATED_STATE).toBe('1');
    await page.addInitScript(({api})=>{
      (window as any).__voiceSent=[];
      class Channel {
        readyState='connecting'; onopen:any; onmessage:any; onclose:any;
        send(raw:string){(window as any).__voiceSent.push(JSON.parse(raw));if(JSON.parse(raw).type==='session.close')this.emit({type:'session.closed',usage:{seconds:2}});}
        close(){this.readyState='closed';this.onclose?.();}
        emit(event:any){this.onmessage?.({data:JSON.stringify(event)});}
      }
      class Peer {
        connectionState='new';iceGatheringState='complete';localDescription:any;onconnectionstatechange:any;ontrack:any;
        channel=new Channel();
        addTrack(){}
        createDataChannel(){(window as any).__voiceChannel=this.channel;return this.channel;}
        async createOffer(){return {type:'offer',sdp:'v=0\r\nfixture-offer'};}
        async setLocalDescription(value:any){this.localDescription=value;}
        async setRemoteDescription(){this.connectionState='connected';this.channel.readyState='open';this.channel.onopen?.();this.onconnectionstatechange?.();if(api==='live')this.channel.emit({type:'session.started',session:{id:'live-fixture'}});}
        close(){this.connectionState='closed';}
      }
      Object.defineProperty(window,'RTCPeerConnection',{value:Peer});
      Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{const ctx=new AudioContext();const dest=ctx.createMediaStreamDestination();return dest.stream;}});
    },{api});
    await page.route('**/api/realtime/status',route=>route.fulfill({json:{ok:true,model:api==='live'?'gpt-live-1':'gpt-realtime-2',voice:'marin',tools:[],openai_key_configured:true,memory:{sqlite:true,sqlite_cli:true,stats:[]},codex:{available:true,mode:'codex-app',write_enabled:true},transcription_model:'fixture'}}));
    let closedContext:string|undefined,sessionCount=0;
    await page.route('**/api/realtime/session',route=>{
      if(route.request().method()==='DELETE'){closedContext=route.request().postDataJSON().contextId;return route.fulfill({json:{closed:true}});}
      sessionCount++;
      return route.fulfill({json:{voice_api:api,client_secret:api==='realtime'?{value:'fixture-ephemeral'}:undefined,model:api==='live'?'gpt-live-1':'gpt-realtime-2',voice:'marin',tools:[],voiceContext:{id:`vctx_fixture_${sessionCount}`,engine:'openai',voiceApi:api,taskConnectorId:'codex',taskModelId:'pinned'}}});
    });
    let call:any;
    await page.route('**/api/realtime/call',route=>{call=route.request().postDataJSON();return route.fulfill({json:{answerSdp:'v=0\r\nfixture-answer'}});});
    await page.goto('/voice');
    await page.getByRole('button',{name:/start/i}).first().click();
    await expect.poll(()=>call?.voiceApi).toBe(api);
    expect(call.ephemeralKey).toBe(api==='realtime'?'fixture-ephemeral':undefined);
    expect(call.contextId).toBe('vctx_fixture_1');
    await page.evaluate(({api})=>{
      const channel=(window as any).__voiceChannel;
      if(api==='live'){
        channel.emit({type:'session.input_transcript.delta',delta:'Проверь память',start_ms:0,end_ms:400});
        channel.emit({type:'session.output_transcript.delta',delta:'Проверяю память',start_ms:200,end_ms:600});
      }else{
        channel.emit({type:'conversation.item.input_audio_transcription.completed',transcript:'Проверь память'});
        channel.emit({type:'response.output_audio_transcript.done',transcript:'Проверяю память'});
      }
    },{api});
    // Transcript groups live in the existing hook and are also reflected in session context.
    await expect.poll(()=>page.evaluate(()=>JSON.stringify(sessionStorage).includes('Проверь память'))).toBe(true);
    const sent=await page.evaluate(()=>(window as any).__voiceSent);
    if(api==='live')expect(sent.some((e:any)=>e.type==='session.start'||e.type==='conversation.item.create')).toBe(false);
    let release:()=>void=()=>{};
    const pending=new Promise<void>(resolve=>{release=resolve;}),toolCalls:any[]=[];
    if(api==='realtime'){
      let intakeContext:string|undefined;
      await page.route('**/api/realtime/intake',route=>{intakeContext=route.request().headers()['x-pritha-voice-context'];return route.fulfill({json:{ok:true,operator_note:'Fixture intake received'}});});
      const paste=page.getByPlaceholder('Paste a command, link, screenshot, file, or context.').filter({visible:true});
      await paste.fill('https://example.test/intake');
      await page.getByRole('button',{name:'Send command',exact:true}).filter({visible:true}).click();
      await page.evaluate(()=>{(window as any).__voiceChannel.emit({type:'response.done',response:{output:[{type:'function_call',name:'confirm_voice_intake',call_id:'intake-confirm',arguments:JSON.stringify({action:'submit',operator_instruction:'Summarize fixture',intent:'summarize',contextId:'vctx_forged'})}]}});});
      await expect.poll(()=>intakeContext).toBe('vctx_fixture_1');await expect(paste).toHaveValue('');
      await page.route('**/api/realtime/tool',async route=>{toolCalls.push(route.request().postDataJSON());await pending;await route.fulfill({json:{ok:true}});});
      await page.evaluate(()=>{
        const channel=(window as any).__voiceChannel;(window as any).__oldVoiceChannel=channel;
        channel.emit({type:'response.done',response:{output:[{type:'function_call',name:'inspect_pritha_files',call_id:'first',arguments:'{}'},{type:'function_call',name:'inspect_pritha_files',call_id:'second',arguments:'{}'}]}});
      });
      await expect.poll(()=>toolCalls.length).toBe(1);expect(toolCalls[0].contextId).toBe('vctx_fixture_1');
    }
    await page.getByRole('button',{name:/stop|disconnect|end/i}).first().click();
    if(api==='live')await expect.poll(()=>page.evaluate(()=>(window as any).__voiceSent.some((e:any)=>e.type==='session.close'))).toBe(true);
    await expect.poll(()=>closedContext).toBe('vctx_fixture_1');
    if(api==='realtime'){
      await page.getByRole('button',{name:'Start Listening',exact:true}).filter({visible:true}).click();
      await expect.poll(()=>call.contextId).toBe('vctx_fixture_2');
      release();
      await page.evaluate(()=>{(window as any).__oldVoiceChannel.emit({type:'conversation.item.input_audio_transcription.completed',transcript:'STALE_SESSION_EVENT'});});
      await page.waitForTimeout(250);
      expect(toolCalls).toHaveLength(1);
      expect(await page.evaluate(()=>JSON.stringify(sessionStorage).includes('STALE_SESSION_EVENT'))).toBe(false);
      await page.getByRole('button',{name:'Stop Listening',exact:true}).filter({visible:true}).click();
      await expect.poll(()=>closedContext).toBe('vctx_fixture_2');
    }
  });
}
