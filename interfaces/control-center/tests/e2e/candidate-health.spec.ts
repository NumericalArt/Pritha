import {test,expect} from '@playwright/test';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';

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
