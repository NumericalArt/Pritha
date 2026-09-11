import { expect, test } from '@playwright/test';

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
    await page.route('**/api/realtime/session',route=>route.fulfill({json:{voice_api:api,client_secret:api==='realtime'?{value:'fixture-ephemeral'}:undefined,model:api==='live'?'gpt-live-1':'gpt-realtime-2',voice:'marin',tools:[]}}));
    let call:any;
    await page.route('**/api/realtime/call',route=>{call=route.request().postDataJSON();return route.fulfill({json:{answerSdp:'v=0\r\nfixture-answer'}});});
    await page.goto('/voice');
    await page.getByRole('button',{name:/start/i}).first().click();
    await expect.poll(()=>call?.voiceApi).toBe(api);
    expect(call.ephemeralKey).toBe(api==='realtime'?'fixture-ephemeral':undefined);
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
    await page.getByRole('button',{name:/stop|disconnect|end/i}).first().click();
    if(api==='live')await expect.poll(()=>page.evaluate(()=>(window as any).__voiceSent.some((e:any)=>e.type==='session.close'))).toBe(true);
  });
}
