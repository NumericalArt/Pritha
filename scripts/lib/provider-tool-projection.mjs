const failure=(code,status=400)=>Object.assign(new Error('The selected provider tool request could not complete.'),{code,status,statusCode:status});
const object=value=>value!==null && typeof value==='object' && !Array.isArray(value);

/** Flatten only this turn's host MCP tools for a provider; keep the inverse map
 * so an upstream cannot substitute a builtin or foreign namespace on return. */
export function toolProjection(input,allowed){
  if(input!==undefined && (!Array.isArray(input) || input.length>128))throw failure('provider_tools_unsupported');
  const tools=[],map=new Map();
  for(const tool of input || []){
    if(!object(tool))throw failure('provider_tools_unsupported');
    if(tool.type==='namespace'){
      if(!allowed || tool.name!=='mcp__pritha' || !Array.isArray(tool.tools) || tool.tools.length>128)throw failure('provider_tools_unsupported');
      for(const member of tool.tools){
        if(member?.type!=='function' || !/^[a-z_]{1,60}$/.test(member.name || ''))throw failure('provider_tools_unsupported');
        const name=tool.name+'__'+member.name;if(!allowed.includes(name))continue;
        if(map.has(name))throw failure('provider_tools_unsupported');map.set(name,{namespace:tool.name,name:member.name});tools.push({...member,name});
      }
    }else{
      if(!['function','custom'].includes(tool.type))throw failure('provider_tools_unsupported');
      if(allowed && !allowed.includes(tool.name))continue;
      if(map.has(tool.name))throw failure('provider_tools_unsupported');map.set(tool.name,{name:tool.name});tools.push(tool);
    }
  }
  if(tools.length>128)throw failure('provider_tools_unsupported');return {tools,map};
}

export function projectProviderToolRequest(input,allowed){
  const projection=toolProjection(input.tools,allowed);if(!allowed)return {...projection,payload:input};
  const result={...input,tools:projection.tools};if(!result.tools.length)result.tool_choice='none';
  if(Array.isArray(result.input))result.input=result.input.map(item=>{
    if(item.type!=='function_call' || !item.namespace)return item;
    const name=item.namespace+'__'+item.name;if(!projection.map.has(name))throw failure('provider_tool_identity_mismatch');
    const {namespace,...rest}=item;return {...rest,name};
  });
  if(object(result.tool_choice) && result.tool_choice.type==='function'){
    const {namespace,name,...rest}=result.tool_choice,qualified=namespace?namespace+'__'+name:name;
    if(!projection.map.has(qualified))throw failure('provider_tool_identity_mismatch');result.tool_choice={...rest,name:qualified};
  }
  return {...projection,payload:result};
}

export function wireCall(item,map){
  if(['custom_tool_call','local_shell_call'].includes(item?.type))throw failure('provider_tool_identity_mismatch',502);
  if(item?.type!=='function_call')return item;
  const target=map.get(item.name);if(!target)throw failure('provider_tool_identity_mismatch',502);
  if(item.namespace!==undefined && item.namespace!==target.namespace)throw failure('provider_tool_identity_mismatch',502);
  return {...item,...target};
}
