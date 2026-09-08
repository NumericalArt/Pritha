import { expect, test } from '@playwright/test';
const storageKey='pritha-control-center-theme-v2';

test('theme selection survives navigation and reload, syncs tabs, and never writes runtime settings',async({page,context})=>{
  const mutations:string[]=[];page.on('request',req=>{if(req.method()==='POST')mutations.push(new URL(req.url()).pathname);});
  await page.addInitScript(()=>localStorage.setItem('pritha-control-center-theme','dark'));
  await page.goto('/settings');await expect(page.locator('html')).toHaveAttribute('data-theme','classic');
  const radios=page.getByRole('radiogroup',{name:'Theme'}).getByRole('radio');await expect(radios).toHaveCount(3);
  await page.getByRole('radio',{name:'Тёмная',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  expect(await page.evaluate(key=>localStorage.getItem(key),storageKey)).toBe('dark');
  await page.goto('/task-chat');await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.goto('/settings');await expect(page.getByRole('radio',{name:'Тёмная',exact:true})).toHaveAttribute('aria-checked','true');
  const other=await context.newPage();await other.goto('/voice');await expect(other.locator('html')).toHaveAttribute('data-theme','dark');
  await page.getByRole('radio',{name:'Светлая',exact:true}).click();await expect(other.locator('html')).toHaveAttribute('data-theme','light');
  await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.evaluate(key=>localStorage.removeItem(key),storageKey);await expect(other.locator('html')).toHaveAttribute('data-theme','classic');
  await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','classic');
  expect(await page.evaluate(()=>localStorage.getItem('pritha-control-center-theme'))).toBe('dark');
  expect(mutations.filter(url=>/settings|config|credentials|tasks/.test(url))).toEqual([]);
  await other.close();
});

for(const mode of ['invalid','blocked','no-attribute'] as const)test(`Classic fallback with ${mode}`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(mode=>{
    if(mode === 'invalid')localStorage.setItem('pritha-control-center-theme-v2','system');
    if(mode === 'blocked')Object.defineProperty(window,'localStorage',{get(){throw new Error('Blocked by test');}});
  },mode);
  await page.goto('/settings');await expect(page.locator('html')).toHaveAttribute('data-theme','classic');
  if(mode === 'no-attribute')await page.evaluate(()=>delete document.documentElement.dataset.theme);
  expect(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--bg-0').trim())).toBe('#060b14');
  expect(errors).toEqual([]);
});

for(const theme of ['dark','light'] as const)for(const width of [1440,1200,768,767,390,320])test(`${theme} surfaces and contrast at ${width}px`,async({page},info)=>{
  test.setTimeout(60_000);await page.setViewportSize({width,height:900});
  await page.addInitScript(theme=>localStorage.setItem('pritha-control-center-theme-v2',theme),theme);
  for(const route of ['agents','voice','task-chat','settings','dev']) {
    await page.goto(`/${route}`);await page.locator('.app-shell').waitFor();await page.evaluate(()=>document.fonts.ready);
    await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
    const overflow=await page.evaluate(()=>{
      const root=document.documentElement;
      const current=root.scrollWidth;
      const theme=root.dataset.theme;
      root.dataset.theme='classic';
      const classic=root.scrollWidth;
      root.dataset.theme=theme;
      return {current,classic,viewport:innerWidth};
    });
    // The accepted Classic has an existing Settings overflow at the 768px breakpoint.
    // A palette change must never introduce or enlarge it; retain evidence instead of changing layout.
    expect(overflow.current,`${route}: themed width must not exceed Classic`).toBeLessThanOrEqual(Math.max(overflow.viewport,overflow.classic)+1);
    if(overflow.classic>overflow.viewport+1) {
      expect({route,width}).toEqual({route:'settings',width:768});
      await info.attach(`${theme}-${route}-${width}-baseline-overflow`,{body:JSON.stringify(overflow),contentType:'application/json'});
    }
    const contrasts=await page.evaluate(()=>{
      const style=getComputedStyle(document.documentElement);
      const rgb=(value:string)=>{const e=document.createElement('span');e.style.color=value;document.body.append(e);const result=getComputedStyle(e).color.match(/[\d.]+/g)!.slice(0,3).map(Number);e.remove();return result;};
      const luminance=(rgb:number[])=>rgb.map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[0.2126,0.7152,0.0722][i],0);
      const token=(name:string)=>luminance(rgb(style.getPropertyValue(name)));
      const result:Record<string,number>={};
      for(const foreground of ['--text-primary','--text-secondary','--text-muted','--theme-link','--theme-error','--theme-warning'])for(const background of ['--bg-0','--surface-input','--surface-panel-flat']) {
        const a=token(foreground),b=token(background);result[foreground+'/'+background]=(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
      }
      return result;
    });
    for(const [pair,ratio] of Object.entries(contrasts))expect(ratio,`${route} ${pair}`).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({path:info.outputPath(`${route}-${theme}-${width}.png`),animations:'disabled'});
  }
});

for(const renderer of ['webgl','canvas2d'])test(`star retains its renderer and size across themes (${renderer})`,async({page},info)=>{
  if(renderer==='canvas2d')await page.addInitScript(()=>{
    const get=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,type:string,...args:unknown[]){return type.includes('webgl')?null:get.apply(this,[type,...args] as Parameters<typeof get>);} as typeof get;
  });
  await page.goto('/voice');const star=page.locator('[data-testid="pritha-star-scene"]:visible');
  await expect(star).toHaveAttribute('data-renderer',renderer);const before=await star.boundingBox();
  for(const theme of ['dark','light','classic']) {
    // Exercise the same-origin storage synchronization path without creating a Voice session.
    await page.evaluate(({theme,storageKey})=>{localStorage.setItem(storageKey,theme);dispatchEvent(new StorageEvent('storage',{key:storageKey,newValue:theme}));},{theme,storageKey});
    await expect(star).toHaveAttribute('data-renderer',renderer);expect(await star.boundingBox()).toEqual(before);
    await star.screenshot({path:info.outputPath(`star-${renderer}-${theme}.png`),animations:'disabled'});
  }
});
