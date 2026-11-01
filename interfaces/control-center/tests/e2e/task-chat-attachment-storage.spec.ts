import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('isolated attachment API preserves exact originals and upload identity without starting a provider',async({request,baseURL})=>{
  const samples=[
    {name:'данные.bin',bytes:Buffer.from([0,255,1,2,0,10]),kind:'file',mediaType:'application/octet-stream'},
    {name:'pixel.png',bytes:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2qYIAAAAASUVORK5CYII=','base64'),kind:'image',mediaType:'image/png'},
    {name:'unsafe.svg',bytes:Buffer.from('<svg onload="throw 1"/>'),kind:'file',mediaType:'application/octet-stream'},
  ];
  for(const sample of samples){
    const id=randomUUID(),url=`/api/codex-chat/v1/attachments/${id}`;
    const headers={origin:new URL(baseURL!).origin,'x-attachment-name':encodeURIComponent(sample.name),'content-type':'image/png'};
    const put=await request.put(url,{headers,data:sample.bytes});expect(put.status()).toBe(201);
    const payload=await put.json();expect(payload.data).toEqual({id,name:sample.name,size:sample.bytes.length,kind:sample.kind,mediaType:sample.mediaType,href:url});
    const repeat=await request.put(url,{headers,data:sample.bytes});expect(repeat.status()).toBe(201);expect((await repeat.json()).data).toEqual(payload.data);
    const conflict=await request.put(url,{headers,data:Buffer.from('different')});expect(conflict.status()).toBe(409);expect((await conflict.json()).error.code).toBe('attachment_conflict');
    const get=await request.get(url);expect(get.status()).toBe(200);expect(await get.body()).toEqual(sample.bytes);
    expect(get.headers()['content-type']).toBe(sample.mediaType);expect(get.headers()['cache-control'].split(',').map(value=>value.trim())).toContain('no-store');expect(get.headers()['content-security-policy']).toContain('sandbox');
  }
  const missing=await request.get(`/api/codex-chat/v1/attachments/${randomUUID()}`);expect(missing.status()).toBe(404);
  expect((await missing.json()).error.code).toBe('attachment_not_found');
});
