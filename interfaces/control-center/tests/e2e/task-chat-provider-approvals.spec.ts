import { test,expect } from '@playwright/test';

for(const width of [1440,390])test(`Claude approvals retain exact turn and action after reload at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  const now=new Date().toISOString(),chat='chat_claude_fixture',answers:Array<any>=[];
  let pending=true;
  const thread={chatId:chat,title:'Claude approval fixture',preview:'',group:'my_chats',origin:'chat',status:'active',activeFlags:['waiting_on_approval'],taskLinks:[],pinned:false,archived:false,historyKind:'mirrored',createdAt:now,updatedAt:now,runtime:{connectorId:'claude',modelId:'claude-sonnet-5-5',providerId:'claude_runtime',protocol:'exec_resume',compatibility:'bound'},continuationState:'blocked_active_turn'};
  const request={requestId:'exact_request_001',chatId:chat,turnId:'exact_turn_001',kind:'file_change_approval',title:'Approval needed',reason:'Review the exact file write.',presentation:{state:'pending',revision:7,path:'hello.txt',proposedContent:'Approved fixture content'}};
  await page.route('**/api/codex-chat/v1/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname.endsWith('/events'))return route.fulfill({contentType:'text/event-stream',body:': ready\n\n'});
    if(route.request().method()==='POST' && url.pathname.endsWith('/requests')){answers.push(route.request().postDataJSON());pending=false;return route.fulfill({json:{apiVersion:'1',requestId:'fixture_answer',data:{submitted:true}}});}
    const data=url.pathname.endsWith('/runtime')?{connectorId:'claude',preferredProvider:'claude_runtime',effectiveProvider:'claude_runtime',availability:'ready',providers:[{providerId:'claude_runtime',availability:'ready',capabilities:{fullChat:true,steerTurn:false,interruptTurn:true,commandApprovals:true,fileChangeApprovals:true}}],models:[{id:'claude-sonnet-5-5'}],selected:{modelId:'claude-sonnet-5-5',sandboxMode:'workspace_write',approvalMode:'on_request'}}
      :url.pathname.endsWith('/threads')?{data:[thread],nextCursor:null}
      :url.pathname.endsWith('/activity')?{cursor:0,changed:[]}
      :url.pathname.endsWith('/history')?{data:[],hasOlder:false,olderCursor:null}
      :url.pathname.endsWith('/delivery')?{runs:[]}
      :{thread,activeTurnId:'exact_turn_001',controls:{turnId:'exact_turn_001',steer:false,interrupt:true},pendingRequests:pending?[request]:[],queued:[],streamUrl:`/api/codex-chat/v1/threads/${chat}/events`,continuationState:'blocked_active_turn',history:{state:'available'}};
    await route.fulfill({json:{apiVersion:'1',requestId:'fixture_response',data}});
  });
  await page.goto('/task-chat?group=my_chats&chat='+chat);await expect(page.getByText('Approval needed',{exact:true})).toBeVisible();
  await page.reload();await expect(page.getByText(/Approved fixture content/)).toBeVisible();
  await expect(page.getByRole('button',{name:'⚡ Steer now'})).toHaveCount(0);
  await page.getByRole('button',{name:'Approve this request',exact:true}).click();
  await expect.poll(()=>answers.length).toBe(1);expect(answers[0]).toMatchObject({requestId:'exact_request_001',revision:7,decision:'accept'});expect(answers[0].clientMessageId).toBeTruthy();
  await expect(page.getByText('Approval needed',{exact:true})).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
