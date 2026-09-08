import { expect, test } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const widths=[1440,1200,768,767,390,320];
const selectors=['body','.desktop-sidebar','.page-header','.voice-session-panel','.mobile-voice-card','.pritha-star-scene','.codex-page','.codex-history','.codex-conversation','.settings-section','.dev-panel','.dev-side-card','.status-strip','.pritha-status-card','.mobile-nav'];

for(const width of widths)test(`Classic paint and geometry evidence at ${width}px`,async({page},info)=>{
  test.setTimeout(60_000);
  await page.setViewportSize({width,height:900});
  await page.addInitScript(()=>{
    localStorage.setItem('pritha-control-center-theme','dark');
    localStorage.setItem('pritha-control-center-theme-v2','classic');
    // Freeze the renderer's elapsed animation time in this harness only.
    Object.defineProperty(performance,'now',{value:()=>1000});
  });
  // Appearance evidence uses fixed telemetry; account usage must not move geometry.
  await page.route('**/api/settings/limits',route=>route.fulfill({json:{ok:true,limits:{
    codexSubscription:{status:'ready',source:'synthetic',detail:'Synthetic account limits',checkedAt:'2026-09-08T12:00:00Z',rateLimits:null,rateLimitsByLimitId:null,commands:{dashboardUrl:'https://chatgpt.com/codex/settings/usage',appStatus:'/status',cliStatus:'codex status',cliUsageDaily:'codex usage daily',cliUsageWeekly:'codex usage weekly',cliUsageCumulative:'codex usage total'}},
    realtimeUsage:{status:'collecting',detail:'Synthetic usage',today:{inputTokens:0,outputTokens:0,totalTokens:0},week:{inputTokens:0,outputTokens:0,totalTokens:0}},
    openaiApiUsage:{status:'planned',detail:'Synthetic API usage'},localPausePolicy:{enabled:false,thresholdPercent:90,action:'none',source:'synthetic',detail:'Synthetic pause policy'},
  }}}));
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  for(const route of ['agents','voice','task-chat','settings','dev']) {
    await page.goto(`/${route}`);await page.locator('.app-shell').waitFor();
    await page.evaluate(()=>document.fonts.ready);
    await expect(page.locator('body')).not.toBeEmpty();
    // Let asynchronous UI status finish before collecting layout, without changing runtime state.
    await page.waitForTimeout(500);
    await page.evaluate(()=>{
      const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
      for(let node=walker.nextNode();node;node=walker.nextNode())if(node.parentElement?.closest('.settings-section,.dev-panel,.dev-side-card')) {
        node.textContent=node.textContent?.replace(/\/(?:private\/)?var\/folders\/[^\s]+\/pritha-e2e-[^/\s]+/g,'<synthetic-fixture>').replace(/https?:\/\/[^\s]+/g,'https://fixture.invalid') || '';
      }
    });
    const metrics=await page.evaluate(selectors=>Object.fromEntries(selectors.flatMap(selector=>[...document.querySelectorAll<HTMLElement>(selector)].filter(element=>element.getBoundingClientRect().width>0).map((element,index)=>{
      const rect=element.getBoundingClientRect(),style=getComputedStyle(element);
      return [`${selector}:${index}`,{x:rect.x,y:rect.y,width:rect.width,height:rect.height,color:style.color,background:style.backgroundImage,backgroundColor:style.backgroundColor,borderColor:style.borderColor,fontFamily:style.fontFamily,fontSize:style.fontSize,padding:style.padding}];
    }))),selectors);
    const name=`${route}-${width}`;
    const directory=process.env.PRITHA_THEME_BASELINE_DIR;
    if(directory) {
      mkdirSync(directory,{recursive:true,mode:0o700});
      const file=path.join(directory,`${name}.json`);
      if(process.env.PRITHA_THEME_EVIDENCE_MODE==='record')writeFileSync(file,JSON.stringify(metrics,null,2));
      else {
        writeFileSync(path.join(directory,`${name}-actual.json`),JSON.stringify(metrics,null,2));
        const previous=JSON.parse(readFileSync(file,'utf8'));
        for(const [key,value] of Object.entries(metrics)) {
          expect(previous[key],key).toBeTruthy();
          for(const field of ['x','y','width','height'] as const)expect(Math.abs(value[field]-previous[key][field]),`${name} ${key} ${field}`).toBeLessThanOrEqual(1);
          for(const field of ['color','background','backgroundColor','borderColor','fontFamily','fontSize','padding'] as const)expect(value[field],`${name} ${key} ${field}`).toEqual(previous[key][field]);
        }
      }
      await page.screenshot({path:path.join(directory,`${name}-${process.env.PRITHA_THEME_EVIDENCE_MODE || 'verify'}.png`),animations:'disabled'});
    } else await page.screenshot({path:info.outputPath(`${name}.png`),animations:'disabled'});
  }
  expect(errors).toEqual([]);
});
