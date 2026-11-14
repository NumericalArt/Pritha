import {test,expect} from '@playwright/test';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {existsSync,mkdirSync,rmSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {resolvePrithaMemoryDatabase} from '../../../../scripts/lib/state-files.mjs';

test('candidate passes strict health including Codex alias and same-build JavaScript chunks',async({baseURL})=>{
  test.setTimeout(90000);
  const root=process.env.PRITHA_ROOT!;
  const result=await promisify(execFile)(process.execPath,[path.join(root,'scripts/control-center-health.mjs'),
    '--base-url',baseURL!,'--strict','--page','/codex,/agents,/voice,/task-chat,/settings','--json'],
    {cwd:root,env:process.env,timeout:80000,maxBuffer:2*1024*1024});
  const health=JSON.parse(result.stdout);
  expect(health.status).toBe('pass');
  expect(health.pages).toHaveLength(5);
  expect(health.chunks.length).toBeGreaterThan(0);
  expect(health.checks.filter((check:{status:string})=>check.status==='fail')).toEqual([]);
});

test('Agents and status remain readable while the memory index is being rebuilt',async({page,request})=>{
  const root=process.env.PRITHA_ROOT!,stateRoot=process.env.PRITHA_STATE_ROOT!;
  expect(process.env.PRITHA_E2E_ISOLATED_STATE).toBe('1');
  const file=resolvePrithaMemoryDatabase({root,stateRoot});
  expect(file.startsWith(stateRoot+path.sep)).toBe(true);
  expect(existsSync(file)).toBe(false);
  mkdirSync(path.dirname(file),{recursive:true});
  const db=new DatabaseSync(file);
  try{
    for(const table of ['documents','chunks','entities','relations','embeddings'])db.exec(`CREATE TABLE ${table}(id INTEGER PRIMARY KEY)`);
    expect((await request.get('/api/status')).status()).toBe(200);
    db.exec('BEGIN EXCLUSIVE');
    // Let the one-second status cache expire so the writer lock is exercised.
    await new Promise(resolve=>setTimeout(resolve,1200));
    const response=await page.goto('/agents',{waitUntil:'load'});
    expect(response?.status()).toBe(200);
    await expect(page.locator('.route-loading')).toHaveCount(0);
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('heading',{name:'Child Agents',exact:true})).toBeVisible();
    const locked=await request.get('/api/status');
    expect(locked.status()).toBe(200);
    expect((await locked.json()).ok).toBe(true);
    db.exec('ROLLBACK');
    await new Promise(resolve=>setTimeout(resolve,1200));
    expect((await request.get('/api/status')).status()).toBe(200);
  }finally{
    if(db.isTransaction)db.exec('ROLLBACK');
    db.close();rmSync(file,{force:true});
  }
});
