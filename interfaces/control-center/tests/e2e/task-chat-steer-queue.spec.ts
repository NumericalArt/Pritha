import { expect, test, type Page, type Route } from "@playwright/test";
import type { AttachmentView } from "../../src/lib/codex-chat/types";

async function fixture(page: Page, steer: boolean, connectorId = steer ? "codex" : "neuraldeep") {
  const chatId=`chat_${connectorId}_queue`,providerId=connectorId==="codex"?"desktop_bundled":`${connectorId}_runtime`;
  const now = "2026-11-01T00:00:00.000Z";
  const files = new Map<string, AttachmentView>();
  const queued: Array<any> = [];
  const calls: Array<{path:string;key:string;body:any}> = [];
  const controls = {holdCancel:false, held:null as Route|null, dropQueueResponse:false};
  const thread = {chatId,title:"Composer fixture",preview:"Running",group:"my_chats",origin:"chat",status:"active",activeFlags:[],taskLinks:[],archived:false,historyKind:"native",createdAt:now,updatedAt:now,runtime:{connectorId,providerId,compatibility:"bound"},continuationState:"continuation_enabled"};
  const runtime = {connectorId,preferredProvider:providerId,effectiveProvider:providerId,availability:"ready",providers:[{providerId,label:"Fixture",locationLabel:"Fixture",protocol:"app_server",availability:"ready",capabilities:{fullChat:true,imageInput:true,fileMetadata:true},stateIdentityHash:"fixture"}],models:[{id:"fixture",inputModalities:["text","image"]}],selected:{modelId:"fixture",sandboxMode:"read_only"}};
  const detail = () => ({thread,activeTurnId:"turn_running",controls:{turnId:"turn_running",steer,interrupt:true},pendingRequests:[],queued:[...queued],streamUrl:`/api/codex-chat/v1/threads/${chatId}/events`,continuationState:"continuation_enabled",history:{state:"available"}});
  const respond = (route:Route, data:unknown) => route.fulfill({json:{apiVersion:"1",requestId:"fixture",data}});
  await page.route("**/api/codex-chat/v1/**", async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (path.endsWith("/ui-activity") || path.endsWith("/activity")) return respond(route, {cursor:0,changed:[]});
    if (path.endsWith("/events")) return route.fulfill({contentType:"text/event-stream",body:": ready\n\n"});
    if (path.includes("/attachments/")) {
      const id=path.split("/").at(-1)!;
      if(request.method()==="PUT") {
        const view:AttachmentView={id,name:decodeURIComponent(request.headers()["x-attachment-name"]),size:request.postDataBuffer()?.length||1,kind:"file",mediaType:"text/plain",href:path};
        files.set(id,view);return respond(route,view);
      }
      return route.fulfill({contentType:"text/plain",body:"fixture"});
    }
    if(request.method()==="POST") {
      const body=request.postDataJSON(), key=request.headers()["idempotency-key"];
      calls.push({path,key,body});
      if(path.endsWith("/queue")) {
        if(body.action==="cancel") {
          const index=queued.findIndex(row=>row.id===body.id);
          if(index>=0 && queued[index].revision!==body.revision) return route.fulfill({status:409,json:{apiVersion:"1",error:{code:"execution_revision_conflict",message:"Refresh this queued message.",retryable:false}}});
          if(index>=0)queued.splice(index,1);
          if(controls.holdCancel){controls.held=route;return;}
        } else if(!queued.some(row=>row.clientMessageId===body.clientMessageId)) queued.push({id:`queued_${queued.length}`,revision:1,state:"queued",text:body.input[0].text,clientMessageId:body.clientMessageId,createdAt:now,reason:null,attachments:(body.attachments||[]).map((id:string)=>files.get(id))});
        if(controls.dropQueueResponse){controls.dropQueueResponse=false;return route.abort("connectionreset");}
        return respond(route,[...queued]);
      }
      if(path.endsWith("/control"))return respond(route,{status:"requested"});
      throw new Error(`Unexpected mutation in fixture: ${path}`);
    }
    if(path.endsWith("/runtime"))return respond(route,runtime);
    if(path.endsWith("/threads"))return respond(route,{data:[thread],nextCursor:null});
    if(path.endsWith("/history"))return respond(route,{data:[{turnId:"turn_running",status:"in_progress",userMessage:{id:"user",role:"user",markdown:"Original task"},items:[],pendingRequestIds:[],startedAt:now,completedAt:null,error:null}],olderCursor:null});
    return respond(route,detail());
  });
  await page.goto(`/task-chat?chat=${chatId}`);
  await expect(page.getByRole("textbox",{name:"Message Pritha"})).toBeEnabled();
  await expect(page.getByRole("button",{name:"Queue",exact:true})).toBeVisible();
  return {calls,queued,controls,respond,chatId};
}

for(const connectorId of ["codex","neuraldeep","claude","openrouter","local"]) for(const width of [1280,390]) {
  test(`running composer queues, restores files, cancels and stops: provider=${connectorId}, width=${width}`,async({page})=>{
    const steer=connectorId==="codex";
    await page.setViewportSize({width,height:900});const f=await fixture(page,steer,connectorId);
    const input=page.getByRole("textbox",{name:"Message Pritha"});
    await input.fill("Следующая задача");
    await page.locator('input[type="file"]').setInputFiles({name:"evidence.txt",mimeType:"text/plain",buffer:Buffer.from("evidence")});
    await expect(page.getByLabel("Draft attachments").getByText("Ready",{exact:true})).toBeVisible();
    if(steer)await expect(page.getByRole("button",{name:"⚡ Steer now",exact:true})).toBeDisabled();
    else await expect(page.getByRole("button",{name:"⚡ Steer now",exact:true})).toHaveCount(0);
    await input.press("Enter");
    await expect(input).toHaveValue("");await expect(page.locator(".codex-queued-message")).toHaveCount(1);
    expect(f.calls[0].path).toBe(`/api/codex-chat/v1/threads/${f.chatId}/queue`);expect(f.calls[0].key).toBe(f.calls[0].body.clientMessageId);
    const attachment=f.calls[0].body.attachments[0];
    await page.locator(".codex-queued-message").getByRole("button",{name:"Edit",exact:true}).click();
    await expect(input).toHaveValue("Следующая задача");await expect(page.getByLabel("Draft attachments").getByRole("button",{name:"Remove evidence.txt",exact:true})).toBeVisible();
    expect(f.calls[1].body).toMatchObject({action:"cancel",revision:1});
    await page.getByRole("button",{name:"Queue",exact:true}).click();await expect(input).toHaveValue("");
    expect(f.calls[2].body.attachments).toEqual([attachment]);
    await page.locator(".codex-queued-message").getByRole("button",{name:"Cancel",exact:true}).click();
    await expect(page.locator(".codex-queued-message")).toHaveCount(0);await expect(input).toHaveValue("");
    await page.getByRole("button",{name:"■ Stop",exact:true}).click();
    await expect.poll(()=>f.calls.at(-1)?.body.action).toBe("interrupt");
    expect(f.calls.at(-1)?.body.expectedTurnId).toBe("turn_running");
  });
}

test("Steer button and shortcut target the exact running turn without queuing",async({page})=>{
  const f=await fixture(page,true), input=page.getByRole("textbox",{name:"Message Pritha"});
  await input.fill("Уточнение");await input.press("Control+Enter");await expect(input).toHaveValue("");
  expect(f.calls).toHaveLength(1);expect(f.calls[0].body).toMatchObject({action:"steer",text:"Уточнение",expectedTurnId:"turn_running"});
  expect(f.queued).toHaveLength(0);
  await input.fill("Ещё уточнение");await page.getByRole("button",{name:"⚡ Steer now",exact:true}).click();
  await expect(input).toHaveValue("");expect(f.calls[1].body.action).toBe("steer");
});

test("non-steer shortcut and IME composition never turn into queue sends",async({page})=>{
  const f=await fixture(page,false), input=page.getByRole("textbox",{name:"Message Pritha"});
  await input.fill("Черновик");await input.press("Control+Enter");
  await input.evaluate(el=>el.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",isComposing:true,bubbles:true})));
  expect(f.calls).toHaveLength(0);await expect(input).toHaveValue("Черновик");
  await input.press("Shift+Enter");await expect(input).toHaveValue("Черновик\n");
});

test("an unknown queue receipt survives reload and retries the same payload once",async({page})=>{
  const f=await fixture(page,false), input=page.getByRole("textbox",{name:"Message Pritha"});
  f.controls.dropQueueResponse=true;await input.fill("Original queue");await input.press("Enter");
  const retry=page.getByRole("button",{name:"Check and retry same queue request",exact:true});
  await expect(retry).toBeEnabled();await page.reload();await expect(retry).toBeEnabled();
  await input.fill("New draft stays");await retry.click();await expect(retry).toHaveCount(0);
  expect(f.calls).toHaveLength(2);expect(f.calls[1]).toEqual(f.calls[0]);expect(f.queued).toHaveLength(1);
  await expect(input).toHaveValue("New draft stays");
});

test("typing during Edit cancellation preserves both the new draft and the cancelled message",async({page})=>{
  const f=await fixture(page,false), input=page.getByRole("textbox",{name:"Message Pritha"});
  await input.fill("Queued original");await input.press("Enter");await expect(input).toHaveValue("");
  f.controls.holdCancel=true;await page.locator(".codex-queued-message").getByRole("button",{name:"Edit",exact:true}).click();
  await expect.poll(()=>Boolean(f.controls.held)).toBe(true);await input.fill("Typed during cancellation");
  await f.respond(f.controls.held!,[]);await expect(input).toHaveValue("Typed during cancellation");
  await expect(page.getByText(/Cancelled message saved for editing/)).toBeVisible();
  await page.reload();await input.fill("");await page.getByRole("button",{name:"Restore to draft",exact:true}).click();
  await expect(input).toHaveValue("Queued original");expect(f.queued).toHaveLength(0);
});
