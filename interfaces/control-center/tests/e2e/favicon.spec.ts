import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const hash=(value:Buffer)=>createHash('sha256').update(value).digest('hex');
const assets=[['icon','/favicon.png'],['shortcut icon','/favicon.png'],['apple-touch-icon','/pritha-logo.png']] as const;

for(const theme of ['classic','dark','light'])test(`Pritha favicon stays available on every page in ${theme}`,async({page})=>{
  test.setTimeout(60_000);
  await page.addInitScript(theme=>localStorage.setItem('pritha-control-center-theme-v2',theme),theme);
  for(const route of ['/','/agents','/voice','/task-chat','/codex','/settings','/dev']) {
    await page.goto(route);
    await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
    for(const [rel,href] of assets){
      // Next may briefly hoist streamed metadata alongside its initial tags,
      // even between two separate checks (seen on /agents while it streams,
      // 2026-11-15). Read count and href together until the tag settles;
      // a persistent duplicate or a wrong href still fails.
      await expect.poll(()=>page.locator(`head link[rel="${rel}"]`).evaluateAll(links=>links.map(link=>link.getAttribute('href')))).toEqual([href]);
    }
  }
  for(const href of [...new Set(assets.map(([,href])=>href))]) {
    const response=await page.request.get(href);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toMatch(/^image\/png/);
    expect(hash(await response.body())).toBe(hash(readFileSync(new URL(`../../public${href}`,import.meta.url))));
    const dimensions=await page.evaluate(async href=>{
      const icon=new Image();icon.src=href;await icon.decode();
      return {width:icon.naturalWidth,height:icon.naturalHeight};
    },href);
    expect(dimensions.width).toBeGreaterThanOrEqual(32);
    expect(dimensions.height).toBe(dimensions.width);
  }
});
