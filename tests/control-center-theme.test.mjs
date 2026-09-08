import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from '../interfaces/control-center/node_modules/typescript/lib/typescript.js';
const source=readFileSync('interfaces/control-center/src/lib/theme.ts','utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const theme=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('first-frame theme uses only v2; missing, old, invalid and blocked storage keep Classic',()=>{
  for(const [value,expected] of [[null,'classic'],['system','classic'],['unknown','classic'],['classic','classic'],['dark','dark'],['light','light']]) {
    const reads=[];const dataset={};
    const context={document:{documentElement:{dataset}},window:{localStorage:{getItem(key){reads.push(key);return key===theme.THEME_STORAGE_KEY?value:'dark';}}}};
    vm.runInNewContext(theme.themeInitScript,context);
    assert.equal(dataset.theme,expected);assert.deepEqual(reads,['pritha-control-center-theme-v2']);
  }
  const dataset={};vm.runInNewContext(theme.themeInitScript,{document:{documentElement:{dataset}},window:{get localStorage(){throw new Error('blocked');}}});
  assert.equal(dataset.theme,'classic');assert.equal(theme.readStoredTheme(),'classic');
});

test('selection persists v2 and updates DOM atomically without changing the legacy value',()=>{
  const previousWindow=globalThis.window,previousDocument=globalThis.document;
  const values=new Map([['pritha-control-center-theme','dark']]),events=[];
  globalThis.document={documentElement:{dataset:{}}};
  globalThis.window={localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)},dispatchEvent:event=>events.push(event.type)};
  try {
    for(const choice of ['dark','light','classic']) {
      theme.selectTheme(choice);
      assert.equal(theme.readStoredTheme(),choice);assert.equal(document.documentElement.dataset.theme,choice);
    }
    assert.equal(values.get('pritha-control-center-theme'),'dark');assert.equal(events.length,3);
    window.localStorage.setItem=()=>{throw new Error('quota');};theme.selectTheme('dark');assert.equal(document.documentElement.dataset.theme,'classic');
  } finally {if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
});

test('new palette CSS is opt-in and leaves assets, Classic tokens and responsive dimensions intact',()=>{
  const css=readFileSync('interfaces/control-center/src/styles/themes.css','utf8');
  assert.doesNotMatch(css,/:root:not|prefers-color-scheme|\.qr.*filter|img\s*\{/);
  assert.ok(css.includes(':root[data-theme="dark"]'));assert.ok(css.includes(':root[data-theme="light"]'));
  assert.doesNotMatch(css,/(?:^|[;{])\s*(?:width|height|padding|margin|font-size|font-family|display|position|animation|transition)\s*:/m);
  assert.match(css,/96px 1px no-repeat/);assert.match(css,/144px 1px no-repeat/);
  assert.match(readFileSync('interfaces/control-center/src/app/layout.tsx','utf8'),/export const dynamic = "force-dynamic"/);
});
