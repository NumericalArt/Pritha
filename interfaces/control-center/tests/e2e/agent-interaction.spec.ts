import {test,expect} from '@playwright/test';

test('agent input, managed start, model response and retry are available on desktop and mobile',async({page},testInfo)=>{
  const status=await(await page.request.get('/api/status')).json();
  const id=status.childAgents.find((agent:{name:string})=>agent.name==='Fixture Managed').id;
  let starts=0,sends=0,fail=false;
  await page.route('**/api/agents/'+id+'/actions/start/plan',route=>route.fulfill({json:{actionEnabled:true,confirmation:{requiredPhrase:'start '+id}}}));
  await page.route('**/api/agents/'+id+'/actions/start',route=>{
    starts++;expect(route.request().postDataJSON()).toEqual({confirmation:'start '+id});return route.fulfill({json:{ok:true,status:'running'}});
  });
  await page.route('**/api/agents/'+id+'/interact',route=>{
    if(route.request().method()==='GET')return route.fulfill({json:{examples:[{text:'Example input'}],running:false,verified:true,model:{provider:'neuraldeep',model:'qwen3.8-flash',connection:'pritha'}}});
    sends++;const input=route.request().postDataJSON();return route.fulfill({json:fail?{ok:false,status:503,output:{error:'provider_unavailable'}}:{ok:true,status:200,output:{answer:input.text}}});
  });
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
    await page.setViewportSize(viewport);await page.goto('/agents/'+id);
    const form=page.getByRole('region',{name:'Try this agent'});await expect(form).toContainText('Connected through Pritha');
    await form.getByRole('textbox',{name:'text',exact:true}).fill('  Привет <script>  ');
    await form.getByRole('button',{name:'Start agent and send'}).click();
    await expect(form.getByLabel('Agent response')).toContainText('Привет <script>');
    await expect(form.getByRole('status')).toHaveText('Response received.');
    const before=starts;fail=true;await form.getByRole('button',{name:'Send',exact:true}).click();
    await expect(form.getByRole('status')).toContainText('provider is unavailable');
    expect(starts).toBe(before);await expect(form.getByRole('textbox',{name:'text',exact:true})).toHaveValue('  Привет <script>  ');
    fail=false;await form.getByRole('button',{name:'Send',exact:true}).click();await expect(form.getByRole('status')).toHaveText('Response received.');
    expect(await page.locator('body').evaluate(el=>el.scrollWidth<=window.innerWidth+1)).toBe(true);
    await page.screenshot({path:testInfo.outputPath('agent-interaction-'+viewport.width+'.png'),fullPage:true});
  }
  expect(starts).toBe(2);expect(sends).toBe(6);
});
