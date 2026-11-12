import {test,expect} from '@playwright/test';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';

test('production factory accepts worker-prepared LLM Outcomes and copies distinct client sources',async()=>{
  test.setTimeout(120000);
  const run=promisify(execFile);
  const result=await run(process.execPath,[path.resolve('../../tests/helpers/compiled-factory.mjs'),path.resolve('.next-pritha-e2e')],{timeout:110000,maxBuffer:1024*1024});
  const receipts=result.stdout.trim().split('\n').map(line=>JSON.parse(line));
  expect(receipts.map(row=>row.connectorId)).toEqual(['codex','claude','neuraldeep']);
  expect(receipts.every(row=>row.compiledOutcomeApproval && row.reviewedOriginalOutcome && row.scaffoldSourcesMatch && row.distinctClientSources===5 && row.automaticBuild && row.paidRequests===0)).toBe(true);
});
